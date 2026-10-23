import { readFileSync } from "node:fs";
import { BN } from "@coral-xyz/anchor";
import { CP_AMM_PROGRAM_ID, deriveConfigAddress } from "@meteora-ag/cp-amm-sdk";
import {
  PublicKey,
  type AccountInfo,
  type Connection,
  type GetProgramAccountsConfig,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  classifyConfig,
  decodeConfigAccount,
  feeScheduleOf,
  fetchFeePreset,
  fetchPublicFeePresets,
  type DammV2FeePreset,
} from "../src/presets/index.js";

interface Fixture {
  name: string;
  address: string;
  data: string;
}

// Real mainnet config accounts. See test/fixtures/README.md.
const { configs } = JSON.parse(
  readFileSync(new URL("./fixtures/configs.json", import.meta.url), "utf8"),
) as { configs: Fixture[] };

function fixture(name: string): Fixture {
  const found = configs.find((c) => c.name === name);
  if (!found) throw new Error(`Missing fixture: ${name}`);
  return found;
}

function bytes(f: Fixture): Buffer {
  return Buffer.from(f.data, "base64");
}

function classify(name: string): DammV2FeePreset {
  const f = fixture(name);
  return classifyConfig(f.address, decodeConfigAccount(bytes(f)));
}

describe("classifyConfig on mainnet fixtures", () => {
  it.each(configs.map((c) => c.name))("classifies %s without unknown values", (name) => {
    const p = classify(name);
    expect(p.protocol).toBe("meteora-damm-v2");
    expect(JSON.stringify(p)).not.toContain('"unknown"');
  });

  it.each(configs.map((c) => c.name))(
    "%s: address matches the SDK derivation from its index",
    (name) => {
      const p = classify(name);
      expect(deriveConfigAddress(new BN(p.index)).toBase58()).toBe(p.address);
    },
  );

  it.each([
    ["constant-both-tokens", "constant", "both-tokens", 25, 25],
    ["constant-only-b", "constant", "only-token-b", 25, 25],
    ["decaying-linear", "decaying-linear", "only-token-b", 5000, 25.00016],
    ["decaying-exponential", "decaying-exponential", "only-token-b", 5000, 24.97525],
    ["market-cap-linear", "market-cap-linear", "both-tokens", 100, 30.0016],
    ["market-cap-exponential", "market-cap-exponential", "both-tokens", 100, 30.36323],
  ] as const)("%s: schedule, collection and fee range", (name, schedule, mode, start, end) => {
    const p = classify(name);
    expect(p.feeSchedule).toBe(schedule);
    expect(p.feeCollection.mode).toBe(mode);
    expect(p.priceRange).toBe("full");
    expect(p.baseFee).toMatchObject({ startingFee: { bps: start }, endingFee: { bps: end } });
  });

  it("reports compounding presets", () => {
    for (const [name, bps] of [
      ["compounding-10", 1000],
      ["compounding-100", 10_000],
    ] as const) {
      const p = classify(name);
      expect(p.feeCollection).toEqual({ mode: "compounding", compoundingFeeBps: bps });
      expect(p.priceRange).toBe("none");
    }
  });

  it("marks public presets", () => {
    const p = classify("constant-both-tokens");
    expect(p.public).toBe(true);
    expect(p.poolCreatorAuthority).toBeNull();
    expect(p.configType).toBe("static");
    expect(p.index).toBe("0");
    expect(p.activationType).toBe("timestamp");
  });

  it("marks private presets and their creator", () => {
    const p = classify("private-static");
    expect(p.public).toBe(false);
    expect(p.poolCreatorAuthority).not.toBeNull();
  });

  it("marks dynamic configs", () => {
    const p = classify("private-dynamic");
    expect(p.configType).toBe("dynamic");
    expect(p.public).toBe(false);
    expect(p.activationType).toBe("slot");
  });
});

describe("feeScheduleOf", () => {
  const fee = { numerator: "1", bps: 0.01 };

  it("treats any non-changing base fee as constant", () => {
    expect(
      feeScheduleOf({
        kind: "rate-limiter",
        constant: true,
        startingFee: fee,
        feeIncrementBps: 0,
        maxFeeBps: 0,
        maxLimiterDuration: 0,
        referenceAmount: "0",
      }),
    ).toBe("constant");
  });

  it("names rate limiters and unknown modes", () => {
    expect(
      feeScheduleOf({
        kind: "rate-limiter",
        constant: false,
        startingFee: fee,
        feeIncrementBps: 1,
        maxFeeBps: 100,
        maxLimiterDuration: 10,
        referenceAmount: "1000",
      }),
    ).toBe("rate-limiter");
    expect(feeScheduleOf({ kind: "unknown", mode: 9 })).toBe("unknown");
  });
});

describe("fetchPublicFeePresets", () => {
  it("queries public config accounts and returns them sorted by index", async () => {
    // Fixtures in reverse index order, to check sorting.
    const publicFixtures = [
      "market-cap-exponential",
      "decaying-linear",
      "constant-both-tokens",
    ].map(fixture);
    let seenFilters: GetProgramAccountsConfig["filters"];
    const connection = {
      getProgramAccounts: async (programId: PublicKey, config: GetProgramAccountsConfig) => {
        expect(programId.equals(CP_AMM_PROGRAM_ID)).toBe(true);
        seenFilters = config.filters;
        return publicFixtures.map((f) => ({
          pubkey: new PublicKey(f.address),
          account: { owner: CP_AMM_PROGRAM_ID, data: bytes(f) },
        }));
      },
    } as unknown as Connection;

    const presets = await fetchPublicFeePresets(connection);
    expect(presets.map((p) => p.index)).toEqual(["0", "24", "576"]);
    expect(seenFilters).toEqual([
      { dataSize: 328 },
      { memcmp: { offset: 0, bytes: expect.any(String) } },
      { memcmp: { offset: 40, bytes: "11111111111111111111111111111111" } },
    ]);
  });
});

describe("fetchFeePreset", () => {
  const f = fixture("decaying-exponential");

  function connectionReturning(account: Partial<AccountInfo<Buffer>> | null): Connection {
    return { getAccountInfo: async () => account } as unknown as Connection;
  }

  it("fetches and classifies one config", async () => {
    const p = await fetchFeePreset(
      connectionReturning({ owner: CP_AMM_PROGRAM_ID, data: bytes(f) }),
      f.address,
    );
    expect(p.feeSchedule).toBe("decaying-exponential");
  });

  it("throws when the account does not exist", async () => {
    await expect(fetchFeePreset(connectionReturning(null), f.address)).rejects.toThrow(
      "Config account not found",
    );
  });

  it("throws when the account belongs to another program", async () => {
    const connection = connectionReturning({ owner: PublicKey.default, data: bytes(f) });
    await expect(fetchFeePreset(connection, f.address)).rejects.toThrow("not the DAMM v2 program");
  });
});
