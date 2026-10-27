// Cross-check the Token-2022 compatibility rules against mainnet, read-only.
//
// 1. Sample Token-2022 mints already used as token A in DAMM v2 pools.
//    A mint in an existing pool passed the program's mint check, so any
//    sampled mint without a token badge should come out "supported".
// 2. Sample mints that hold a DAMM v2 token badge and count how many have
//    extensions that actually need one.
//
// Usage (after `npm run build`):
//   npm run verify:token-compat -w @lpkit-sol/damm-v2 -- [rpcUrl] [sampleSize]
// Defaults: the public mainnet RPC and 400 mints. Some RPC providers reject the
// getProgramAccounts calls below; the public endpoint accepted them when this was written.
// Pools created through a config with the "create pool without mint validation"
// permission skip the program's check, so a few mismatches can be legitimate.

import { CP_AMM_PROGRAM_ID, deriveTokenBadgeAddress } from "@meteora-ag/cp-amm-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { checkTokenCompatibility } from "@lpkit-sol/damm-v2/token-compat";

const rpcUrl = process.argv[2] ?? "https://api.mainnet-beta.solana.com";
const sampleSize = Number(process.argv[3] ?? 400);
const connection = new Connection(rpcUrl, "confirmed");

// Pool account offsets (8-byte discriminator included), from the DAMM v2 IDL.
const POOL_SIZE = 1112;
const TOKEN_A_MINT_OFFSET = 168;
const TOKEN_A_FLAG_OFFSET = 482;
const TOKEN_2022_FLAG = "2"; // base58 for byte 1
// TokenBadge account: discriminator, then token_mint.
const TOKEN_BADGE_DISCRIMINATOR = "LYg8tBNVsV7";

function evenlySpaced(items, count) {
  const sorted = [...items].sort();
  if (sorted.length <= count) return sorted;
  const step = sorted.length / count;
  return Array.from({ length: count }, (_, i) => sorted[Math.floor(i * step)]);
}

async function fetchInBatches(keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 100) {
    out.push(...(await connection.getMultipleAccountsInfo(keys.slice(i, i + 100))));
  }
  return out;
}

async function checkMints(mints) {
  const keys = mints.map((m) => new PublicKey(m));
  const [mintAccounts, badgeAccounts] = await Promise.all([
    fetchInBatches(keys),
    fetchInBatches(keys.map((k) => deriveTokenBadgeAddress(k))),
  ]);
  return keys.flatMap((key, i) => {
    const account = mintAccounts[i];
    if (!account) return [];
    const hasBadge = badgeAccounts[i]?.owner.equals(CP_AMM_PROGRAM_ID) ?? false;
    return [checkTokenCompatibility(key, account, { tokenBadgeExists: hasBadge })];
  });
}

function count(results, pick) {
  const counts = {};
  for (const r of results) counts[pick(r)] = (counts[pick(r)] ?? 0) + 1;
  return counts;
}

const slot = await connection.getSlot();
console.log(`RPC ${rpcUrl}, slot ${slot}`);

// 1. Token-2022 mints used as token A in pools.
const pools = await connection.getProgramAccounts(CP_AMM_PROGRAM_ID, {
  dataSlice: { offset: TOKEN_A_MINT_OFFSET, length: 32 },
  filters: [
    { dataSize: POOL_SIZE },
    { memcmp: { offset: TOKEN_A_FLAG_OFFSET, bytes: TOKEN_2022_FLAG } },
  ],
});
const poolMints = [...new Set(pools.map((p) => new PublicKey(p.account.data).toBase58()))];
const poolResults = await checkMints(evenlySpaced(poolMints, sampleSize));
const withoutBadge = poolResults.filter((r) => r.tokenBadge.exists === false);
const mismatches = withoutBadge.filter((r) => r.status !== "supported");

console.log(
  `\nPools with a Token-2022 token A: ${pools.length}, unique mints: ${poolMints.length}`,
);
console.log(`Sampled mints: ${poolResults.length}, without a token badge: ${withoutBadge.length}`);
console.log(`  of those, "supported": ${withoutBadge.length - mismatches.length}`);
for (const m of mismatches)
  console.log(`  mismatch ${m.mint}: ${m.status} — ${m.reasons.join(" ")}`);

// 2. Mints that hold a token badge.
const badges = await connection.getProgramAccounts(CP_AMM_PROGRAM_ID, {
  dataSlice: { offset: 8, length: 32 },
  filters: [{ memcmp: { offset: 0, bytes: TOKEN_BADGE_DISCRIMINATOR } }],
});
const badgeMints = badges.map((b) => new PublicKey(b.account.data).toBase58());
const badgeResults = await checkMints(evenlySpaced(badgeMints, sampleSize));

console.log(`\nToken badges: ${badgeMints.length}, sampled: ${badgeResults.length}`);
console.log(
  "  status:",
  count(badgeResults, (r) => r.status),
);

process.exitCode = mismatches.length === 0 ? 0 : 1;
