import type { BN } from "@coral-xyz/anchor";
import {
  FEE_DENOMINATOR,
  MAX_FEE_BPS_V0,
  MAX_FEE_BPS_V1,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  decodePodAlignedFeeMarketCapScheduler,
  decodePodAlignedFeeRateLimiter,
  decodePodAlignedFeeTimeScheduler,
  getBaseFeeModeFromPodAlignedData,
  getFeeMarketCapMinBaseFeeNumerator,
  getFeeTimeMinBaseFeeNumerator,
  type PoolState,
} from "@meteora-ag/cp-amm-sdk";
import type { PublicKey } from "@solana/web3.js";
import type { TokenProgramKind } from "@lpkit-sol/core";
import type {
  ActivationKind,
  BaseFeeClassification,
  CollectFeeModeKind,
  DammV2PoolClassification,
  FeeValue,
  PoolStatusKind,
  PoolTypeKind,
  PriceRangeKind,
} from "./types.js";

const DEFAULT_PUBKEY = "11111111111111111111111111111111";
// Dividing (rather than multiplying by 1e-5) keeps whole-bps fees exact.
const NUMERATOR_PER_BPS = FEE_DENOMINATOR / 10_000;

// Byte values below mirror the enums in the DAMM v2 program (programs/cp-amm/src/state/pool.rs).
const COLLECT_FEE_MODES: readonly CollectFeeModeKind[] = [
  "both-tokens",
  "only-token-b",
  "compounding",
];
const POOL_TYPES: readonly PoolTypeKind[] = ["permissionless", "customizable"];
const POOL_STATUSES: readonly PoolStatusKind[] = ["enabled", "disabled"];
const ACTIVATION_TYPES: readonly ActivationKind[] = ["slot", "timestamp"];
const TOKEN_PROGRAMS: readonly TokenProgramKind[] = ["spl-token", "token-2022"];
const MAX_FEE_BPS_BY_VERSION: readonly number[] = [MAX_FEE_BPS_V0, MAX_FEE_BPS_V1];
const COMPOUNDING = 2;

function pick<T>(values: readonly T[], index: number, fallback: T): T {
  return values[index] ?? fallback;
}

function fee(numerator: BN): FeeValue {
  return { numerator: numerator.toString(), bps: numerator.toNumber() / NUMERATOR_PER_BPS };
}

function classifyBaseFee(data: number[]): BaseFeeClassification {
  const raw = Buffer.from(data);
  const mode = getBaseFeeModeFromPodAlignedData(raw);

  switch (mode) {
    case 0:
    case 1: {
      const p = decodePodAlignedFeeTimeScheduler(raw);
      const ending = getFeeTimeMinBaseFeeNumerator(
        p.cliffFeeNumerator,
        p.numberOfPeriod,
        p.reductionFactor,
        mode,
      );
      return {
        kind: "time-scheduler",
        curve: mode === 0 ? "linear" : "exponential",
        constant: ending.eq(p.cliffFeeNumerator),
        startingFee: fee(p.cliffFeeNumerator),
        endingFee: fee(ending),
        numberOfPeriods: p.numberOfPeriod,
        periodFrequency: p.periodFrequency.toString(),
        reductionFactor: p.reductionFactor.toString(),
      };
    }
    case 2: {
      const p = decodePodAlignedFeeRateLimiter(raw);
      return {
        kind: "rate-limiter",
        // Mirrors `is_zero_rate_limiter` in the program.
        constant:
          p.referenceAmount.isZero() &&
          p.maxLimiterDuration === 0 &&
          p.maxFeeBps === 0 &&
          p.feeIncrementBps === 0,
        startingFee: fee(p.cliffFeeNumerator),
        feeIncrementBps: p.feeIncrementBps,
        maxFeeBps: p.maxFeeBps,
        maxLimiterDuration: p.maxLimiterDuration,
        referenceAmount: p.referenceAmount.toString(),
      };
    }
    case 3:
    case 4: {
      const p = decodePodAlignedFeeMarketCapScheduler(raw);
      const ending = getFeeMarketCapMinBaseFeeNumerator(
        p.cliffFeeNumerator,
        p.numberOfPeriod,
        p.reductionFactor,
        mode,
      );
      return {
        kind: "market-cap-scheduler",
        curve: mode === 3 ? "linear" : "exponential",
        constant: ending.eq(p.cliffFeeNumerator),
        startingFee: fee(p.cliffFeeNumerator),
        endingFee: fee(ending),
        numberOfPeriods: p.numberOfPeriod,
        sqrtPriceStepBps: p.sqrtPriceStepBps,
        schedulerExpirationDuration: p.schedulerExpirationDuration,
        reductionFactor: p.reductionFactor.toString(),
      };
    }
    default:
      return { kind: "unknown", mode };
  }
}

function classifyPriceRange(state: PoolState): PriceRangeKind {
  if (state.collectFeeMode === COMPOUNDING) return "none";
  return state.sqrtMinPrice.eq(MIN_SQRT_PRICE) && state.sqrtMaxPrice.eq(MAX_SQRT_PRICE)
    ? "full"
    : "concentrated";
}

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
  const dynamic = fees.dynamicFee;
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
    feeCollection: {
      mode: pick(COLLECT_FEE_MODES, state.collectFeeMode, "unknown"),
      compoundingFeeBps: state.collectFeeMode === COMPOUNDING ? fees.compoundingFeeBps : null,
    },
    baseFee: classifyBaseFee(fees.baseFee.baseFeeInfo.data),
    dynamicFee: {
      enabled: dynamic.initialized !== 0,
      binStep: dynamic.binStep,
      filterPeriod: dynamic.filterPeriod,
      decayPeriod: dynamic.decayPeriod,
      reductionFactor: dynamic.reductionFactor,
      maxVolatilityAccumulator: dynamic.maxVolatilityAccumulator,
      variableFeeControl: dynamic.variableFeeControl,
    },
    maxFeeBps: MAX_FEE_BPS_BY_VERSION[state.feeVersion] ?? null,
    protocolFeePercent: fees.protocolFeePercent,
    referralFeePercent: fees.referralFeePercent,
    activation: {
      type: pick(ACTIVATION_TYPES, state.activationType, "unknown"),
      point: state.activationPoint.toString(),
    },
    alphaVault: whitelistedVault === DEFAULT_PUBKEY ? null : whitelistedVault,
    priceRange: classifyPriceRange(state),
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
