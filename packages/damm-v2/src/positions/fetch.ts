import {
  CP_AMM_PROGRAM_ID,
  derivePositionAddress,
  type PoolState,
  type PositionState,
} from "@meteora-ag/cp-amm-sdk";
import { AccountLayout, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, type AccountInfo, type Commitment, type Connection } from "@solana/web3.js";
import { decodePoolAccount } from "../classify/decode.js";
import { getCoder } from "../shared/coder.js";
import { classifyPosition } from "./classify.js";
import { decodePositionAccount, decodeVestingAccount } from "./decode.js";
import type { DammV2PositionClassification } from "./types.js";

// Byte offset of `decimals` in an SPL Token / Token-2022 mint account.
const MINT_DECIMALS_OFFSET = 44;
const SLOT_ACTIVATION = 0;

export interface FetchPositionOptions {
  /**
   * Look up separate Vesting accounts with `getProgramAccounts` (default true).
   * Set to false for RPCs that do not allow that call; `vesting` then only
   * lists a schedule stored on the position itself.
   */
  vestingAccounts?: boolean;
}

const toKey = (key: PublicKey | string) => (typeof key === "string" ? new PublicKey(key) : key);

async function getAccounts(
  connection: Connection,
  keys: PublicKey[],
  commitment?: Commitment,
): Promise<(AccountInfo<Buffer> | null)[]> {
  const out: (AccountInfo<Buffer> | null)[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    out.push(...(await connection.getMultipleAccountsInfo(keys.slice(i, i + 100), commitment)));
  }
  return out;
}

async function getClock(connection: Connection, commitment?: Commitment) {
  const slot = await connection.getSlot(commitment);
  const time = (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  return { slot, time };
}

async function getDecimals(connection: Connection, mints: string[], commitment?: Commitment) {
  const unique = [...new Set(mints)];
  const accounts = await getAccounts(connection, unique.map(toKey), commitment);
  const decimals = new Map<string, number>();
  accounts.forEach((account, i) => {
    const isMint =
      account &&
      (account.owner.equals(TOKEN_PROGRAM_ID) || account.owner.equals(TOKEN_2022_PROGRAM_ID));
    const value = isMint ? account.data[MINT_DECIMALS_OFFSET] : undefined;
    if (value !== undefined) decimals.set(unique[i]!, value);
  });
  return decimals;
}

async function getVestings(connection: Connection, position: PublicKey, commitment?: Commitment) {
  const accounts = await connection.getProgramAccounts(CP_AMM_PROGRAM_ID, {
    ...(commitment ? { commitment } : {}),
    filters: [
      { memcmp: getCoder().accounts.memcmp("vesting") },
      { memcmp: { offset: 8, bytes: position.toBase58() } },
    ],
  });
  return accounts.map(({ pubkey, account }) => ({
    address: pubkey,
    state: decodeVestingAccount(account.data),
  }));
}

async function classifyMany(
  connection: Connection,
  positions: { address: PublicKey; state: PositionState }[],
  owner: PublicKey | null,
  commitment: Commitment | undefined,
  options: FetchPositionOptions,
): Promise<DammV2PositionClassification[]> {
  if (positions.length === 0) return [];
  const poolKeys = [...new Set(positions.map((p) => p.state.pool.toBase58()))];
  const [poolAccounts, clock] = await Promise.all([
    getAccounts(connection, poolKeys.map(toKey), commitment),
    getClock(connection, commitment),
  ]);
  const pools = new Map<string, PoolState>();
  poolAccounts.forEach((account, i) => {
    if (account?.owner.equals(CP_AMM_PROGRAM_ID)) {
      pools.set(poolKeys[i]!, decodePoolAccount(account.data));
    }
  });
  const decimals = await getDecimals(
    connection,
    [...pools.values()].flatMap((p) => [p.tokenAMint.toBase58(), p.tokenBMint.toBase58()]),
    commitment,
  );

  const results: DammV2PositionClassification[] = [];
  for (const { address, state } of positions) {
    const pool = pools.get(state.pool.toBase58());
    if (!pool) continue;
    // Separate Vesting accounts only exist when the position has vested liquidity.
    const vestings =
      options.vestingAccounts === false || state.vestedLiquidity.isZero()
        ? []
        : await getVestings(connection, address, commitment);
    const tokenA = decimals.get(pool.tokenAMint.toBase58());
    const tokenB = decimals.get(pool.tokenBMint.toBase58());
    results.push(
      classifyPosition(address, state, pool, {
        currentTime: clock.time,
        currentPoint: pool.activationType === SLOT_ACTIVATION ? clock.slot : clock.time,
        vestings,
        ...(owner ? { owner } : {}),
        decimals: {
          ...(tokenA === undefined ? {} : { tokenA }),
          ...(tokenB === undefined ? {} : { tokenB }),
        },
      }),
    );
  }
  return results;
}

/**
 * Fetch one position and classify it, with its pool, token decimals, vesting
 * accounts and the current clock. Read-only.
 *
 * Throws if the account does not exist or is not owned by the DAMM v2 program.
 */
export async function fetchPosition(
  connection: Connection,
  address: PublicKey | string,
  commitment?: Commitment,
  options: FetchPositionOptions = {},
): Promise<DammV2PositionClassification> {
  const key = toKey(address);
  const account = await connection.getAccountInfo(key, commitment);
  if (!account) {
    throw new Error(`Position account not found: ${key.toBase58()}`);
  }
  if (!account.owner.equals(CP_AMM_PROGRAM_ID)) {
    throw new Error(
      `Account ${key.toBase58()} is owned by ${account.owner.toBase58()}, not the DAMM v2 program`,
    );
  }
  const [result] = await classifyMany(
    connection,
    [{ address: key, state: decodePositionAccount(account.data) }],
    null,
    commitment,
    options,
  );
  if (!result) throw new Error(`Pool for position ${key.toBase58()} not found`);
  return result;
}

/**
 * Fetch every DAMM v2 position held by a wallet, largest first. Read-only.
 *
 * A position belongs to whoever holds its NFT (a Token-2022 token with amount 1).
 * Needs an RPC that allows `getTokenAccountsByOwner`.
 */
export async function fetchPositionsByOwner(
  connection: Connection,
  owner: PublicKey | string,
  commitment?: Commitment,
  options: FetchPositionOptions = {},
): Promise<DammV2PositionClassification[]> {
  const ownerKey = toKey(owner);
  const tokenAccounts = await connection.getTokenAccountsByOwner(
    ownerKey,
    { programId: TOKEN_2022_PROGRAM_ID },
    commitment,
  );
  const nftMints = tokenAccounts.value
    .map(({ account }) => AccountLayout.decode(account.data))
    .filter((t) => t.amount === 1n)
    .map((t) => t.mint);
  const positionKeys = nftMints.map((mint) => derivePositionAddress(mint));
  const accounts = await getAccounts(connection, positionKeys, commitment);

  const positions = positionKeys.flatMap((address, i) => {
    const account = accounts[i];
    return account?.owner.equals(CP_AMM_PROGRAM_ID)
      ? [{ address, state: decodePositionAccount(account.data) }]
      : [];
  });
  const results = await classifyMany(connection, positions, ownerKey, commitment, options);
  return results.sort((a, b) => (BigInt(b.liquidity.total) > BigInt(a.liquidity.total) ? 1 : -1));
}
