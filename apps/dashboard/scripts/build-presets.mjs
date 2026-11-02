// Write public/presets.json with every public DAMM v2 fee preset, read-only.
// The dashboard loads this file instead of calling getProgramAccounts from the browser.
//
// Usage (after `npm run build` in the repository root):
//   npm run build:presets -w @lpkit-sol/dashboard [-- rpcUrl]

import { mkdirSync, writeFileSync } from "node:fs";
import { Connection } from "@solana/web3.js";
import { fetchPublicFeePresets } from "@lpkit-sol/damm-v2/presets";

const rpcUrl = process.argv[2] ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(rpcUrl, "confirmed");

const slot = await connection.getSlot();
const presets = await fetchPublicFeePresets(connection);

const compact = presets.map((p) => ({
  address: p.address,
  index: p.index,
  feeSchedule: p.feeSchedule,
  startBps: p.baseFee.kind === "unknown" ? null : p.baseFee.startingFee.bps,
  endBps: "endingFee" in p.baseFee ? p.baseFee.endingFee.bps : null,
  collectMode: p.feeCollection.mode,
  compoundingFeeBps: p.feeCollection.compoundingFeeBps,
  dynamicFee: p.dynamicFee.enabled,
  activationType: p.activationType,
  priceRange: p.priceRange,
}));

const out = new URL("../public/presets.json", import.meta.url);
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    slot,
    count: compact.length,
    presets: compact,
  }),
);
console.log(`Wrote ${compact.length} presets at slot ${slot}`);
