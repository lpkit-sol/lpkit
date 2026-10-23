import type { BN } from "@coral-xyz/anchor";
import {
  FEE_DENOMINATOR,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  decodePodAlignedFeeMarketCapScheduler,
  decodePodAlignedFeeRateLimiter,
  decodePodAlignedFeeTimeScheduler,
  getBaseFeeModeFromPodAlignedData,
  getFeeMarketCapMinBaseFeeNumerator,
  getFeeTimeMinBaseFeeNumerator,
} from "@meteora-ag/cp-amm-sdk";
import type {
  ActivationKind,
  BaseFeeClassification,
  CollectFeeModeKind,
  DynamicFeeClassification,
  FeeCollection,
  FeeSchedule,
  FeeValue,
  PriceRangeKind,
} from "./types.js";

export const DEFAULT_PUBKEY = "11111111111111111111111111111111";

// Dividing (rather than multiplying by 1e-5) keeps whole-bps fees exact.
const NUMERATOR_PER_BPS = FEE_DENOMINATOR / 10_000;
const COMPOUNDING = 2;

// Byte values below mirror the enums in the DAMM v2 program (programs/cp-amm/src/state).
const COLLECT_FEE_MODES: readonly CollectFeeModeKind[] = [
  "both-tokens",
  "only-token-b",
  "compounding",
];
const ACTIVATION_TYPES: readonly ActivationKind[] = ["slot", "timestamp"];

export function pick<T>(values: readonly T[], index: number, fallback: T): T {
  return values[index] ?? fallback;
}

export function activationKind(activationType: number): ActivationKind {
  return pick(ACTIVATION_TYPES, activationType, "unknown");
}

export function classifyFeeCollection(
  collectFeeMode: number,
  compoundingFeeBps: number,
): FeeCollection {
  return {
    mode: pick(COLLECT_FEE_MODES, collectFeeMode, "unknown"),
    compoundingFeeBps: collectFeeMode === COMPOUNDING ? compoundingFeeBps : null,
  };
}

function fee(numerator: BN): FeeValue {
  return { numerator: numerator.toString(), bps: numerator.toNumber() / NUMERATOR_PER_BPS };
}

/** Decode the 32-byte base fee data shared by pool and config accounts. */
export function classifyBaseFee(data: number[]): BaseFeeClassification {
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

/** Summarise a decoded base fee as one of the fee options offered at pool creation. */
export function feeScheduleOf(baseFee: BaseFeeClassification): FeeSchedule {
  switch (baseFee.kind) {
    case "time-scheduler":
      return baseFee.constant ? "constant" : `decaying-${baseFee.curve}`;
    case "market-cap-scheduler":
      return baseFee.constant ? "constant" : `market-cap-${baseFee.curve}`;
    case "rate-limiter":
      return baseFee.constant ? "constant" : "rate-limiter";
    default:
      return "unknown";
  }
}

/** Fields shared by the pool's DynamicFeeStruct and the config's DynamicFeeConfig. */
interface DynamicFeeFields {
  initialized: number;
  binStep: number;
  filterPeriod: number;
  decayPeriod: number;
  reductionFactor: number;
  maxVolatilityAccumulator: number;
  variableFeeControl: number;
}

export function classifyDynamicFee(dynamic: DynamicFeeFields): DynamicFeeClassification {
  return {
    enabled: dynamic.initialized !== 0,
    binStep: dynamic.binStep,
    filterPeriod: dynamic.filterPeriod,
    decayPeriod: dynamic.decayPeriod,
    reductionFactor: dynamic.reductionFactor,
    maxVolatilityAccumulator: dynamic.maxVolatilityAccumulator,
    variableFeeControl: dynamic.variableFeeControl,
  };
}

export function classifyPriceRange(
  collectFeeMode: number,
  sqrtMinPrice: BN,
  sqrtMaxPrice: BN,
): PriceRangeKind {
  if (collectFeeMode === COMPOUNDING) return "none";
  return sqrtMinPrice.eq(MIN_SQRT_PRICE) && sqrtMaxPrice.eq(MAX_SQRT_PRICE)
    ? "full"
    : "concentrated";
}
