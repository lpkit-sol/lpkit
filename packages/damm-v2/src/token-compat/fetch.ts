import { CP_AMM_PROGRAM_ID, deriveTokenBadgeAddress } from "@meteora-ag/cp-amm-sdk";
import { PublicKey, type Commitment, type Connection } from "@solana/web3.js";
import { checkTokenCompatibility } from "./check.js";
import type { DammV2TokenCompatibility } from "./types.js";

/**
 * Fetch a mint and its DAMM v2 token badge, then check compatibility.
 *
 * Read-only: one `getMultipleAccounts` call (mint and badge) and one `getEpochInfo` call.
 * Throws if the mint does not exist or is not owned by a token program.
 */
export async function fetchTokenCompatibility(
  connection: Connection,
  mint: PublicKey | string,
  commitment?: Commitment,
): Promise<DammV2TokenCompatibility> {
  const key = typeof mint === "string" ? new PublicKey(mint) : mint;
  const badge = deriveTokenBadgeAddress(key);
  const [[mintAccount, badgeAccount], epochInfo] = await Promise.all([
    connection.getMultipleAccountsInfo([key, badge], commitment),
    connection.getEpochInfo(commitment),
  ]);
  if (!mintAccount) {
    throw new Error(`Mint account not found: ${key.toBase58()}`);
  }
  return checkTokenCompatibility(key, mintAccount, {
    tokenBadgeExists: badgeAccount?.owner.equals(CP_AMM_PROGRAM_ID) ?? false,
    epoch: epochInfo.epoch,
  });
}
