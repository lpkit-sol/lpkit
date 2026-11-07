import { readFileSync } from "node:fs";
import { CP_AMM_PROGRAM_ID, derivePositionAddress } from "@meteora-ag/cp-amm-sdk";
import { AccountLayout, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, type Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodePoolAccount } from "../src/classify/decode.js";
import {
  classifyPosition,
  decodePositionAccount,
  decodeVestingAccount,
  fetchPosition,
  fetchPositionsByOwner,
  type DammV2PositionClassification,
} from "../src/positions/index.js";

interface Fixtures {
  slot: number;
  blockTime: number;
  positions: { name: string; address: string; data: string }[];
  pools: { address: string; data: string }[];
  vestings: { address: string; position: string; data: string }[];
}

// Real mainnet accounts. See test/fixtures/README.md.
const f = JSON.parse(
  readFileSync(new URL("./fixtures/positions.json", import.meta.url), "utf8"),
) as Fixtures;

const bytes = (b64: string) => Buffer.from(b64, "base64");

function position(name: string) {
  const p = f.positions.find((x) => x.name === name);
  if (!p) throw new Error(`Missing fixture: ${name}`);
  return { address: p.address, state: decodePositionAccount(bytes(p.data)) };
}

function poolOf(address: string) {
  const p = f.pools.find((x) => x.address === address);
  if (!p) throw new Error(`Missing pool fixture: ${address}`);
  return decodePoolAccount(bytes(p.data));
}

function vestingsOf(address: string) {
  return f.vestings
    .filter((v) => v.position === address)
    .map((v) => ({ address: v.address, state: decodeVestingAccount(bytes(v.data)) }));
}

function classify(name: string, withClock = true): DammV2PositionClassification {
  const { address, state } = position(name);
  const pool = poolOf(state.pool.toBase58());
  const point = pool.activationType === 0 ? f.slot : f.blockTime;
  return classifyPosition(address, state, pool, {
    ...(withClock ? { currentTime: f.blockTime, currentPoint: point } : {}),
    vestings: vestingsOf(address),
  });
}

describe("decodePositionAccount", () => {
  it("decodes every fixture to a position whose address matches its NFT mint PDA", () => {
    for (const p of f.positions) {
      const state = decodePositionAccount(bytes(p.data));
      expect(derivePositionAddress(state.nftMint).toBase58()).toBe(p.address);
    }
  });

  it("decodes vesting accounts that point back at their position", () => {
    for (const v of f.vestings) {
      expect(decodeVestingAccount(bytes(v.data)).position.toBase58()).toBe(v.position);
    }
  });
});

describe("classifyPosition", () => {
  it("splits liquidity into parts that add up to the total", () => {
    for (const { name } of f.positions) {
      const { liquidity } = classify(name);
      const sum =
        BigInt(liquidity.unlocked) + BigInt(liquidity.vested) + BigInt(liquidity.permanentlyLocked);
      expect(sum.toString()).toBe(liquidity.total);
    }
  });

  it("describes a plain unlocked position", () => {
    const c = classify("unlocked");
    expect(c).toMatchObject({
      protocol: "meteora-damm-v2",
      address: "E5dXAx81PvEWYhXBCm9DbzpcsBx1Fb1syJ6HMpQcwK7W",
      pool: "15383kH2wdECRkyg2kLdnQvPabvTkwJns9hb6WiDn4B",
      owner: null,
      tokenB: { mint: "So11111111111111111111111111111111111111112", decimals: null },
      liquidity: { vested: "0", permanentlyLocked: "0", poolSharePercent: 31.82 },
      amounts: { tokenA: "6621781685", tokenB: "334617288" },
      rewards: [],
      vesting: [],
      delegatePermissions: [],
    });
    expect(c.liquidity.unlocked).toBe(c.liquidity.total);
  });

  it("describes a fully locked position that holds the whole pool", () => {
    const c = classify("permanently-locked");
    expect(c.liquidity.unlocked).toBe("0");
    expect(c.liquidity.permanentlyLocked).toBe(c.liquidity.total);
    expect(c.liquidity.poolSharePercent).toBe(100);
    expect(c.unclaimedFees).toEqual({ tokenA: "4026814543244", tokenB: "1358782" });
    expect(c.claimedFees).toEqual({ tokenA: "342203784", tokenB: "888457" });
  });

  it("lists initialized pool rewards, with pending amounts only when the time is known", () => {
    expect(classify("rewards").rewards).toEqual([
      { index: 0, mint: "48MVyYSAMCMquqCVY13ub3ZNYXvKCfiFp6nceF5qjups", pending: "23147636" },
    ]);
    expect(classify("rewards", false).rewards[0]?.pending).toBeNull();
  });

  it("reads a vesting account whose next period has not started", () => {
    const [v] = classify("vested-and-locked").vesting;
    expect(v).toEqual({
      source: "vesting-account",
      address: "13xL4wxYUNMvZoCKX5wjqA3jonqCUqpU62hwGCceoh7R",
      cliffPoint: "1770730514",
      periodFrequency: "31536000",
      numberOfPeriods: 1,
      cliffUnlockLiquidity: "40",
      liquidityPerPeriod: "1106804644422573096999999999960",
      totalReleasedLiquidity: "40",
      availableToRelease: "0",
      complete: false,
    });
    // The single period ends after the fixture's block time.
    expect(1770730514 + 31536000).toBeGreaterThan(f.blockTime);
  });

  it("computes releasable vesting liquidity from the schedule", () => {
    const c = classify("unlocked-vested-locked");
    const [v] = c.vesting;
    if (!v) throw new Error("expected a vesting schedule");
    // Independent check: cliff + elapsed periods * per period - already released.
    const periods = BigInt(
      Math.floor((f.blockTime - Number(v.cliffPoint)) / Number(v.periodFrequency)),
    );
    const expected =
      BigInt(v.cliffUnlockLiquidity) +
      (periods < BigInt(v.numberOfPeriods) ? periods : BigInt(v.numberOfPeriods)) *
        BigInt(v.liquidityPerPeriod) -
      BigInt(v.totalReleasedLiquidity);
    expect(v.availableToRelease).toBe(expected.toString());
    expect(v.complete).toBe(false);
    // What is still vesting in the account matches the position's vested liquidity.
    const remaining =
      BigInt(v.cliffUnlockLiquidity) +
      BigInt(v.numberOfPeriods) * BigInt(v.liquidityPerPeriod) -
      BigInt(v.totalReleasedLiquidity);
    expect(remaining.toString()).toBe(c.liquidity.vested);
  });

  it("leaves vesting progress empty without a current point", () => {
    const [v] = classify("unlocked-vested-locked", false).vesting;
    expect(v?.availableToRelease).toBeNull();
    expect(v?.complete).toBeNull();
  });

  it("decodes delegate permission bits", () => {
    const { address, state } = position("unlocked");
    const pool = poolOf(state.pool.toBase58());
    const c = classifyPosition(address, { ...state, delegatePermission: 0b101 }, pool);
    expect(c.delegatePermissions).toHaveLength(2);
  });

  it("passes owner and decimals through", () => {
    const { address, state } = position("unlocked");
    const c = classifyPosition(address, state, poolOf(state.pool.toBase58()), {
      owner: "11111111111111111111111111111111",
      decimals: { tokenA: 6, tokenB: 9 },
    });
    expect(c.owner).toBe("11111111111111111111111111111111");
    expect(c.tokenA.decimals).toBe(6);
    expect(c.tokenB.decimals).toBe(9);
  });
});

// A fake read-only connection that serves the fixtures.
function mockConnection(owner: PublicKey, heldNfts: { mint: PublicKey; amount: bigint }[]) {
  const accounts = new Map<string, { owner: PublicKey; data: Buffer }>();
  for (const p of f.positions) {
    accounts.set(p.address, { owner: CP_AMM_PROGRAM_ID, data: bytes(p.data) });
  }
  for (const p of f.pools) {
    const data = bytes(p.data);
    accounts.set(p.address, { owner: CP_AMM_PROGRAM_ID, data });
    const pool = decodePoolAccount(data);
    for (const [mint, decimals] of [
      [pool.tokenAMint, 6],
      [pool.tokenBMint, 9],
    ] as const) {
      const mintData = Buffer.alloc(82);
      mintData[44] = decimals;
      accounts.set(mint.toBase58(), { owner: TOKEN_PROGRAM_ID, data: mintData });
    }
  }
  const info = (key: PublicKey) => {
    const a = accounts.get(key.toBase58());
    return a ? { ...a, executable: false, lamports: 1 } : null;
  };
  const calls = { getProgramAccounts: 0 };
  const connection = {
    getAccountInfo: async (key: PublicKey) => info(key),
    getMultipleAccountsInfo: async (keys: PublicKey[]) => keys.map(info),
    getSlot: async () => f.slot,
    getBlockTime: async () => f.blockTime,
    getProgramAccounts: async (
      _program: PublicKey,
      config: { filters: { memcmp: { offset: number; bytes: string } }[] },
    ) => {
      calls.getProgramAccounts++;
      const target = config.filters.find((x) => x.memcmp.offset === 8)?.memcmp.bytes;
      return f.vestings
        .filter((v) => v.position === target)
        .map((v) => ({
          pubkey: new PublicKey(v.address),
          account: { owner: CP_AMM_PROGRAM_ID, data: bytes(v.data) },
        }));
    },
    getTokenAccountsByOwner: async (wallet: PublicKey, filter: { programId: PublicKey }) => {
      expect(wallet.equals(owner)).toBe(true);
      expect(filter.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
      return {
        value: heldNfts.map(({ mint, amount }) => {
          const data = Buffer.alloc(AccountLayout.span);
          AccountLayout.encode(
            {
              mint,
              owner,
              amount,
              delegateOption: 0,
              delegate: PublicKey.default,
              state: 1,
              isNativeOption: 0,
              isNative: 0n,
              delegatedAmount: 0n,
              closeAuthorityOption: 0,
              closeAuthority: PublicKey.default,
            },
            data,
          );
          return { pubkey: PublicKey.unique(), account: { owner: TOKEN_2022_PROGRAM_ID, data } };
        }),
      };
    },
  };
  return { connection: connection as unknown as Connection, calls };
}

describe("fetchPosition", () => {
  it("fetches the pool, decimals, vesting accounts and clock", async () => {
    const { connection, calls } = mockConnection(PublicKey.default, []);
    const c = await fetchPosition(connection, "7UCVhWGboQto2wwe22UFtqx6j2sW6veUCwUhA9NnvJuL");
    expect(c).toEqual({
      ...classify("unlocked-vested-locked"),
      tokenA: { ...c.tokenA, decimals: 6 },
      tokenB: { ...c.tokenB, decimals: 9 },
    });
    expect(calls.getProgramAccounts).toBe(1);
  });

  it("skips the vesting lookup when nothing is vested", async () => {
    const { connection, calls } = mockConnection(PublicKey.default, []);
    await fetchPosition(connection, "E5dXAx81PvEWYhXBCm9DbzpcsBx1Fb1syJ6HMpQcwK7W");
    expect(calls.getProgramAccounts).toBe(0);
  });

  it("can skip Vesting accounts for RPCs without getProgramAccounts", async () => {
    const { connection, calls } = mockConnection(PublicKey.default, []);
    const c = await fetchPosition(
      connection,
      "7UCVhWGboQto2wwe22UFtqx6j2sW6veUCwUhA9NnvJuL",
      undefined,
      { vestingAccounts: false },
    );
    expect(c.vesting).toEqual([]);
    expect(calls.getProgramAccounts).toBe(0);
  });

  it("rejects missing accounts and accounts of other programs", async () => {
    const { connection } = mockConnection(PublicKey.default, []);
    await expect(fetchPosition(connection, PublicKey.unique())).rejects.toThrow(/not found/);
    const mint = decodePoolAccount(bytes(f.pools[0]!.data)).tokenAMint;
    await expect(fetchPosition(connection, mint)).rejects.toThrow(/not the DAMM v2 program/);
  });
});

describe("fetchPositionsByOwner", () => {
  it("finds positions from held NFTs, largest first, and ignores other tokens", async () => {
    const owner = PublicKey.unique();
    const nft = (name: string) => position(name).state.nftMint;
    const { connection } = mockConnection(owner, [
      { mint: nft("unlocked"), amount: 1n },
      { mint: nft("unlocked-vested-locked"), amount: 1n },
      { mint: nft("rewards"), amount: 0n }, // sold or closed: not held
      { mint: PublicKey.unique(), amount: 1n }, // some other Token-2022 NFT
    ]);
    const list = await fetchPositionsByOwner(connection, owner);
    expect(list.map((p) => p.address)).toEqual([
      "7UCVhWGboQto2wwe22UFtqx6j2sW6veUCwUhA9NnvJuL",
      "E5dXAx81PvEWYhXBCm9DbzpcsBx1Fb1syJ6HMpQcwK7W",
    ]);
    expect(list.every((p) => p.owner === owner.toBase58())).toBe(true);
  });

  it("returns an empty list for a wallet without positions", async () => {
    const owner = PublicKey.unique();
    const { connection } = mockConnection(owner, []);
    expect(await fetchPositionsByOwner(connection, owner)).toEqual([]);
  });
});
