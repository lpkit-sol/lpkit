import { readFileSync } from "node:fs";
import { deriveTokenBadgeAddress, CP_AMM_PROGRAM_ID } from "@meteora-ag/cp-amm-sdk";
import { PublicKey, type AccountInfo, type Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  checkTokenCompatibility,
  fetchTokenCompatibility,
  type DammV2TokenCompatibility,
} from "../src/token-compat/index.js";

interface Fixture {
  name: string;
  address: string;
  owner: string;
  data: string;
  tokenBadgeExists?: boolean;
}

// Real mainnet mint accounts. See test/fixtures/README.md.
const { mints } = JSON.parse(
  readFileSync(new URL("./fixtures/mints.json", import.meta.url), "utf8"),
) as { mints: Fixture[] };

function fixture(name: string): Fixture {
  const found = mints.find((m) => m.name === name);
  if (!found) throw new Error(`Missing fixture: ${name}`);
  return found;
}

function account(f: Fixture, data: Uint8Array = Buffer.from(f.data, "base64")) {
  return { owner: new PublicKey(f.owner), data };
}

function check(name: string, epoch?: number): DammV2TokenCompatibility {
  const f = fixture(name);
  return checkTokenCompatibility(f.address, account(f), {
    ...(f.tokenBadgeExists === undefined ? {} : { tokenBadgeExists: f.tokenBadgeExists }),
    ...(epoch === undefined ? {} : { epoch }),
  });
}

/**
 * Overwrite the authority and program id inside a Token-2022 mint's TransferHook extension.
 * Layout: 165 bytes (base mint padded to account size), 1 account-type byte, then
 * TLV entries of u16 type, u16 length and a value of authority (32) + program id (32).
 */
function withHook(data: Buffer, authority: PublicKey, program: PublicKey): Buffer {
  const out = Buffer.from(data);
  let offset = 166;
  while (offset + 4 <= out.length) {
    const type = out.readUInt16LE(offset);
    const length = out.readUInt16LE(offset + 2);
    if (type === 14) {
      authority.toBuffer().copy(out, offset + 4);
      program.toBuffer().copy(out, offset + 4 + 32);
      return out;
    }
    offset += 4 + length;
  }
  throw new Error("No TransferHook extension found");
}

function hookExtension(r: DammV2TokenCompatibility) {
  return r.extensions.find((e) => e.name === "TransferHook");
}

describe("checkTokenCompatibility on mainnet mints", () => {
  it.each([
    ["spl-token-usdc", "spl-token", "supported"],
    ["token2022-no-extensions", "token-2022", "supported"],
    ["token2022-metadata-only", "token-2022", "supported"],
    ["token2022-transfer-fee", "token-2022", "supported"],
    ["token2022-badged", "token-2022", "supported-with-token-badge"],
    ["token2022-badged-fee-change", "token-2022", "supported-with-token-badge"],
    ["token2022-native-mint", "token-2022", "unsupported"],
  ] as const)("%s: %s, %s", (name, program, status) => {
    const r = check(name);
    expect(r.tokenProgram).toBe(program);
    expect(r.status).toBe(status);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.tokenBadge.address).toBe(deriveTokenBadgeAddress(new PublicKey(r.mint)).toBase58());
  });

  it("lists extensions with their names", () => {
    expect(check("token2022-metadata-only").extensions).toEqual([
      { type: 18, name: "MetadataPointer", allowedWithoutBadge: true },
      { type: 19, name: "TokenMetadata", allowedWithoutBadge: true },
    ]);
    expect(check("spl-token-usdc").extensions).toEqual([]);
  });

  it("explains which extensions need a token badge", () => {
    const r = check("token2022-badged");
    const blocked = r.extensions.filter((e) => !e.allowedWithoutBadge).map((e) => e.name);
    expect(blocked).toEqual(expect.arrayContaining(["PermanentDelegate", "Pausable"]));
    expect(r.reasons).toContain("Extension PermanentDelegate requires a token badge.");
    expect(r.reasons).toContain("A token badge exists for this mint.");
  });

  it("requires a badge when none exists or it was not checked", () => {
    const f = fixture("token2022-badged");
    expect(checkTokenCompatibility(f.address, account(f), { tokenBadgeExists: false }).status).toBe(
      "requires-token-badge",
    );
    const unchecked = checkTokenCompatibility(f.address, account(f));
    expect(unchecked.status).toBe("requires-token-badge");
    expect(unchecked.tokenBadge.exists).toBeNull();
  });

  it("requires a badge for a transfer hook with an authority set (mainnet case)", () => {
    const r = check("token2022-badged");
    expect(r.transferHook?.programId).toBeNull();
    expect(r.transferHook?.authority).not.toBeNull();
    expect(hookExtension(r)?.allowedWithoutBadge).toBe(false);
    expect(r.reasons).toContain(
      "TransferHook with a hook program or authority set requires a token badge.",
    );
  });

  it("accepts a transfer hook with no program and no authority", () => {
    const f = fixture("token2022-badged");
    const data = withHook(Buffer.from(f.data, "base64"), PublicKey.default, PublicKey.default);
    const r = checkTokenCompatibility(f.address, account(f, data));
    expect(r.transferHook).toEqual({ programId: null, authority: null });
    expect(hookExtension(r)?.allowedWithoutBadge).toBe(true);
  });

  it("requires a badge for a transfer hook with a program set", () => {
    const f = fixture("token2022-badged");
    const hookProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const data = withHook(Buffer.from(f.data, "base64"), PublicKey.default, hookProgram);
    const r = checkTokenCompatibility(f.address, account(f, data));
    expect(r.transferHook).toEqual({ programId: hookProgram.toBase58(), authority: null });
    expect(hookExtension(r)?.allowedWithoutBadge).toBe(false);
  });

  it("accepts transfer fees without a badge and reports the fee", () => {
    const r = check("token2022-transfer-fee", 900);
    expect(r.status).toBe("supported");
    expect(r.transferFee).toMatchObject({ olderBps: 100, newerBps: 100, activeBps: 100 });
    expect(check("spl-token-usdc").transferFee).toBeNull();
  });

  it("picks the transfer fee in effect for the given epoch", () => {
    expect(check("token2022-badged-fee-change", 900).transferFee).toMatchObject({
      olderBps: 300,
      newerBps: 100,
      newerEpoch: "1050",
      activeBps: 300,
    });
    expect(check("token2022-badged-fee-change", 1050).transferFee?.activeBps).toBe(100);
    expect(check("token2022-badged-fee-change").transferFee?.activeBps).toBeNull();
  });

  it("reports mint and freeze authorities", () => {
    const usdc = check("spl-token-usdc");
    expect(usdc.decimals).toBe(6);
    expect(usdc.freezeAuthority).not.toBeNull();
    expect(check("token2022-native-mint").reasons[0]).toContain("native mint");
  });

  it("throws for accounts not owned by a token program", () => {
    const f = fixture("spl-token-usdc");
    expect(() =>
      checkTokenCompatibility(f.address, { owner: PublicKey.default, data: Buffer.alloc(82) }),
    ).toThrow("not a token program");
  });
});

describe("fetchTokenCompatibility", () => {
  const f = fixture("token2022-badged");

  function connection(
    mint: { owner: PublicKey; data: Uint8Array } | null,
    badge: Partial<AccountInfo<Buffer>> | null,
  ): Connection {
    return {
      getMultipleAccountsInfo: async (keys: PublicKey[]) => {
        expect(keys[1]?.equals(deriveTokenBadgeAddress(new PublicKey(f.address)))).toBe(true);
        return [mint, badge];
      },
      getEpochInfo: async () => ({ epoch: 900 }),
    } as unknown as Connection;
  }

  it("uses the token badge when the program owns it", async () => {
    const r = await fetchTokenCompatibility(
      connection(account(f), { owner: CP_AMM_PROGRAM_ID, data: Buffer.alloc(168) }),
      f.address,
    );
    expect(r.status).toBe("supported-with-token-badge");
    expect(r.tokenBadge.exists).toBe(true);
  });

  it("reports a missing token badge", async () => {
    const r = await fetchTokenCompatibility(connection(account(f), null), f.address);
    expect(r.status).toBe("requires-token-badge");
    expect(r.tokenBadge.exists).toBe(false);
  });

  it("throws when the mint does not exist", async () => {
    await expect(fetchTokenCompatibility(connection(null, null), f.address)).rejects.toThrow(
      "Mint account not found",
    );
  });
});
