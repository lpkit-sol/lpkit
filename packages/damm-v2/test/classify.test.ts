import { readFileSync } from "node:fs";
import { CP_AMM_PROGRAM_ID } from "@meteora-ag/cp-amm-sdk";
import { PublicKey, type AccountInfo, type Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  classifyPool,
  decodePoolAccount,
  fetchPoolClassification,
  type DammV2PoolClassification,
} from "../src/index.js";

interface Fixture {
  name: string;
  address: string;
  data: string;
}

// Real mainnet pool accounts. See test/fixtures/README.md.
const { pools } = JSON.parse(
  readFileSync(new URL("./fixtures/pools.json", import.meta.url), "utf8"),
) as { pools: Fixture[] };

function fixture(name: string): Fixture {
  const found = pools.find((p) => p.name === name);
  if (!found) throw new Error(`Missing fixture: ${name}`);
  return found;
}

function bytes(f: Fixture): Buffer {
  return Buffer.from(f.data, "base64");
}

function classify(name: string): DammV2PoolClassification {
  const f = fixture(name);
  return classifyPool(f.address, decodePoolAccount(bytes(f)));
}

describe("classifyPool on mainnet fixtures", () => {
  it.each(pools.map((p) => p.name))("classifies %s without unknown values", (name) => {
    const c = classify(name);
    expect(c.protocol).toBe("meteora-damm-v2");
    expect(c.address).toBe(fixture(name).address);
    expect(c.status).toBe("enabled");
    expect(c.poolType).not.toBe("unknown");
    expect(c.feeCollection.mode).not.toBe("unknown");
    expect(c.baseFee.kind).not.toBe("unknown");
    expect(c.activation.type).not.toBe("unknown");
    expect(c.maxFeeBps).not.toBeNull();
  });

  // Expected values were cross-checked against Meteora's public data API
  // (damm-v2.datapi.meteora.ag) on 2026-10-23.
  it.each([
    ["both-tokens-dynamic-token2022", "both-tokens", "full", "permissionless", true],
    ["both-tokens-customizable", "both-tokens", "full", "customizable", false],
    ["only-b-fee-version-0", "only-token-b", "full", "permissionless", true],
    ["compounding-full-reinvest", "compounding", "none", "permissionless", true],
    ["market-cap-exponential-concentrated", "only-token-b", "concentrated", "customizable", true],
  ] as const)("%s: collection, range, type, dynamic fee", (name, mode, range, type, dynamic) => {
    const c = classify(name);
    expect(c.feeCollection.mode).toBe(mode);
    expect(c.priceRange).toBe(range);
    expect(c.poolType).toBe(type);
    expect(c.dynamicFee.enabled).toBe(dynamic);
  });

  it("reports the compounding share only for compounding pools", () => {
    expect(classify("compounding-full-reinvest").feeCollection.compoundingFeeBps).toBe(10_000);
    expect(classify("compounding-customizable").feeCollection.compoundingFeeBps).toBe(9_000);
    expect(classify("only-b-fee-version-0").feeCollection.compoundingFeeBps).toBeNull();
  });

  it("summarises the base fee as a fee schedule", () => {
    expect(classify("both-tokens-dynamic-token2022").feeSchedule).toBe("constant");
    expect(classify("time-exponential").feeSchedule).toBe("decaying-exponential");
    expect(classify("market-cap-linear").feeSchedule).toBe("market-cap-linear");
    expect(classify("rate-limiter").feeSchedule).toBe("rate-limiter");
  });

  it("decodes a constant fee", () => {
    expect(classify("both-tokens-dynamic-token2022").baseFee).toMatchObject({
      kind: "time-scheduler",
      curve: "linear",
      constant: true,
      startingFee: { numerator: "40000000", bps: 400 },
      endingFee: { numerator: "40000000", bps: 400 },
    });
  });

  it("decodes a fractional constant fee", () => {
    expect(classify("compounding-customizable").baseFee).toMatchObject({
      constant: true,
      startingFee: { bps: 88.8 },
    });
  });

  it("decodes an exponential time scheduler", () => {
    expect(classify("time-exponential").baseFee).toMatchObject({
      kind: "time-scheduler",
      curve: "exponential",
      constant: false,
      startingFee: { bps: 5000 },
      endingFee: { bps: 601.00362 },
    });
  });

  it("decodes linear and exponential market cap schedulers", () => {
    expect(classify("market-cap-linear").baseFee).toMatchObject({
      kind: "market-cap-scheduler",
      curve: "linear",
      constant: false,
      startingFee: { bps: 600 },
      endingFee: { bps: 30.0012 },
    });
    expect(classify("market-cap-exponential").baseFee).toMatchObject({
      kind: "market-cap-scheduler",
      curve: "exponential",
      constant: false,
      startingFee: { bps: 600 },
      endingFee: { bps: 30.02871 },
    });
  });

  it("decodes a rate limiter", () => {
    expect(classify("rate-limiter").baseFee).toMatchObject({
      kind: "rate-limiter",
      constant: false,
      startingFee: { bps: 1 },
      feeIncrementBps: 1,
      maxFeeBps: 1,
      maxLimiterDuration: 1,
      referenceAmount: "1000000000",
    });
  });

  it("reads token programs per side", () => {
    const both = classify("both-tokens-dynamic-token2022");
    expect([both.tokenA.tokenProgram, both.tokenB.tokenProgram]).toEqual([
      "token-2022",
      "token-2022",
    ]);
    const onlyB = classify("only-b-token2022-b");
    expect([onlyB.tokenA.tokenProgram, onlyB.tokenB.tokenProgram]).toEqual([
      "spl-token",
      "token-2022",
    ]);
  });

  it("reads the max fee from the fee version", () => {
    expect(classify("only-b-fee-version-0").maxFeeBps).toBe(5000);
    expect(classify("both-tokens-customizable").maxFeeBps).toBe(9900);
  });

  it("reads slot and timestamp activation", () => {
    expect(classify("slot-activation").activation.type).toBe("slot");
    expect(classify("time-exponential").activation).toEqual({
      type: "timestamp",
      point: "1775891687",
    });
  });

  it("computes the permanently locked share", () => {
    expect(classify("fully-locked").liquidity.permanentlyLockedPercent).toBe(100);
    expect(classify("compounding-full-reinvest").liquidity.permanentlyLockedPercent).toBe(0);
    // Empty pool: no liquidity to compare against.
    expect(classify("rate-limiter").liquidity.permanentlyLockedPercent).toBeNull();
  });
});

describe("classifyPool on unexpected values", () => {
  it("falls back to unknown instead of guessing", () => {
    const f = fixture("both-tokens-customizable");
    const state = decodePoolAccount(bytes(f));
    state.collectFeeMode = 9;
    state.poolType = 9;
    state.poolStatus = 9;
    state.activationType = 9;
    state.feeVersion = 9;
    // Byte 8 of the base fee data holds the base fee mode.
    state.poolFees.baseFee.baseFeeInfo.data[8] = 9;

    const c = classifyPool(f.address, state);
    expect(c.feeCollection.mode).toBe("unknown");
    expect(c.poolType).toBe("unknown");
    expect(c.status).toBe("unknown");
    expect(c.activation.type).toBe("unknown");
    expect(c.maxFeeBps).toBeNull();
    expect(c.baseFee).toEqual({ kind: "unknown", mode: 9 });
  });
});

describe("fetchPoolClassification", () => {
  const f = fixture("time-exponential");

  function connectionReturning(account: Partial<AccountInfo<Buffer>> | null): Connection {
    return { getAccountInfo: async () => account } as unknown as Connection;
  }

  it("fetches and classifies a pool", async () => {
    const connection = connectionReturning({ owner: CP_AMM_PROGRAM_ID, data: bytes(f) });
    const c = await fetchPoolClassification(connection, f.address);
    expect(c.address).toBe(f.address);
    expect(c.baseFee.kind).toBe("time-scheduler");
  });

  it("throws when the account does not exist", async () => {
    await expect(fetchPoolClassification(connectionReturning(null), f.address)).rejects.toThrow(
      "Pool account not found",
    );
  });

  it("throws when the account belongs to another program", async () => {
    const connection = connectionReturning({ owner: PublicKey.default, data: bytes(f) });
    await expect(fetchPoolClassification(connection, f.address)).rejects.toThrow(
      "not the DAMM v2 program",
    );
  });
});
