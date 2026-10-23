import type { BN } from "@coral-xyz/anchor";
import { MAX_FEE_BPS_V0, MAX_FEE_BPS_V1, type PoolState } from "@meteora-ag/cp-amm-sdk";
import type { PublicKey } from "@solana/web3.js";
import type { TokenProgramKind } from "@lpkit-sol/core";
import {
  DEFAULT_PUBKEY,
  activationKind,
  classifyBaseFee,
  classifyDynamicFee,
  classifyFeeCollection,
  classifyPriceRange,
  feeScheduleOf,
  pick,
} from "../shared/fees.js";
import type { DammV2PoolClassification, PoolStatusKind, PoolTypeKind } from "./types.js";

// Byte values below mirror the enums in the DAMM v2 program (programs/cp-amm/src/state/pool.rs).
const POOL_TYPES: readonly PoolTypeKind[] = ["permissionless", "customizable"];
const POOL_STATUSES: readonly PoolStatusKind[] = ["enabled", "disabled"];
const TOKEN_PROGRAMS: readonly TokenProgramKind[] = ["spl-token", "token-2022"];
const MAX_FEE_BPS_BY_VERSION: readonly number[] = [MAX_FEE_BPS_V0, MAX_FEE_BPS_V1];

function lockedPercent(locked: BN, total: BN): number | null {
  if (total.isZero()) return null;
  // Two decimal places without converting u128 values to floating point.
  return locked.muln(10_000).div(total).toNumber() / 100;
}

/**
 * Describe a DAMM v2 pool in readable terms.
 *
 * Pure function: pass the pool address and the decoded state, either from
 * `decodePoolAccount` or from `CpAmm.fetchPoolState` in `@meteora-ag/cp-amm-sdk`.
 */
export function classifyPool(
  address: PublicKey | string,
  state: PoolState,
): DammV2PoolClassification {
  const fees = state.poolFees;
  const baseFee = classifyBaseFee(fees.baseFee.baseFeeInfo.data);
  const whitelistedVault = state.whitelistedVault.toBase58();

  return {
    protocol: "meteora-damm-v2",
    address: typeof address === "string" ? address : address.toBase58(),
    tokenA: {
      mint: state.tokenAMint.toBase58(),
      tokenProgram: pick(TOKEN_PROGRAMS, state.tokenAFlag, "spl-token"),
    },
    tokenB: {
      mint: state.tokenBMint.toBase58(),
      tokenProgram: pick(TOKEN_PROGRAMS, state.tokenBFlag, "spl-token"),
    },
    status: pick(POOL_STATUSES, state.poolStatus, "unknown"),
    poolType: pick(POOL_TYPES, state.poolType, "unknown"),
    creator: state.creator.toBase58(),
    feeCollection: classifyFeeCollection(state.collectFeeMode, fees.compoundingFeeBps),
    feeSchedule: feeScheduleOf(baseFee),
    baseFee,
    dynamicFee: classifyDynamicFee(fees.dynamicFee),
    maxFeeBps: MAX_FEE_BPS_BY_VERSION[state.feeVersion] ?? null,
    protocolFeePercent: fees.protocolFeePercent,
    referralFeePercent: fees.referralFeePercent,
    activation: {
      type: activationKind(state.activationType),
      point: state.activationPoint.toString(),
    },
    alphaVault: whitelistedVault === DEFAULT_PUBKEY ? null : whitelistedVault,
    priceRange: classifyPriceRange(state.collectFeeMode, state.sqrtMinPrice, state.sqrtMaxPrice),
    liquidity: {
      total: state.liquidity.toString(),
      permanentlyLocked: state.permanentLockLiquidity.toString(),
      permanentlyLockedPercent: lockedPercent(state.permanentLockLiquidity, state.liquidity),
    },
    versions: {
      fee: state.feeVersion,
      layout: state.layoutVersion,
    },
  };
}
