import { CP_AMM_PROGRAM_ID } from "@meteora-ag/cp-amm-sdk";
import { PublicKey, type Commitment, type Connection } from "@solana/web3.js";
import { classifyPool } from "./classify.js";
import { decodePoolAccount } from "./decode.js";
import type { DammV2PoolClassification } from "./types.js";

/**
 * Fetch a pool account and classify it. Read-only: one `getAccountInfo` call.
 *
 * Throws if the account does not exist or is not owned by the DAMM v2 program.
 */
export async function fetchPoolClassification(
  connection: Connection,
  address: PublicKey | string,
  commitment?: Commitment,
): Promise<DammV2PoolClassification> {
  const key = typeof address === "string" ? new PublicKey(address) : address;
  const account = await connection.getAccountInfo(key, commitment);
  if (!account) {
    throw new Error(`Pool account not found: ${key.toBase58()}`);
  }
  if (!account.owner.equals(CP_AMM_PROGRAM_ID)) {
    throw new Error(
      `Account ${key.toBase58()} is owned by ${account.owner.toBase58()}, not the DAMM v2 program`,
    );
  }
  return classifyPool(key, decodePoolAccount(account.data));
}
