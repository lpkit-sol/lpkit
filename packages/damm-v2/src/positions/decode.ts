import type { PositionState, VestingState } from "@meteora-ag/cp-amm-sdk";
import { getCoder } from "../shared/coder.js";

/** Decode raw position account data into the `PositionState` shape used by `@meteora-ag/cp-amm-sdk`. */
export function decodePositionAccount(data: Uint8Array): PositionState {
  return getCoder().accounts.decode("position", Buffer.from(data)) as PositionState;
}

/** Decode raw Vesting account data into the `VestingState` shape used by `@meteora-ag/cp-amm-sdk`. */
export function decodeVestingAccount(data: Uint8Array): VestingState {
  return getCoder().accounts.decode("vesting", Buffer.from(data)) as VestingState;
}
