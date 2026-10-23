import type { PoolState } from "@meteora-ag/cp-amm-sdk";
import { getCoder } from "../shared/coder.js";

/**
 * Decode raw pool account data into the same `PoolState` shape
 * returned by `CpAmm.fetchPoolState` in `@meteora-ag/cp-amm-sdk`.
 */
export function decodePoolAccount(data: Uint8Array): PoolState {
  return getCoder().accounts.decode("pool", Buffer.from(data)) as PoolState;
}
