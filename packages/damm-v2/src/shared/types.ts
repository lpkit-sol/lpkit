export type CollectFeeModeKind = "both-tokens" | "only-token-b" | "compounding" | "unknown";
export type ActivationKind = "slot" | "timestamp" | "unknown";
export type FeeCurve = "linear" | "exponential";

/**
 * How the price range is set.
 * - `full`: concentrated pool spanning the whole allowed range (MIN_SQRT_PRICE..MAX_SQRT_PRICE).
 * - `concentrated`: a narrower custom range.
 * - `none`: compounding pools use x * y = k and store no price range.
 */
export type PriceRangeKind = "full" | "concentrated" | "none";

/**
 * One-word summary of how the base fee behaves, matching the fee options
 * shown when creating a pool: Constant, Decaying (linear or exponential),
 * Market Cap (linear or exponential) and Rate Limiter.
 */
export type FeeSchedule =
  | "constant"
  | "decaying-linear"
  | "decaying-exponential"
  | "market-cap-linear"
  | "market-cap-exponential"
  | "rate-limiter"
  | "unknown";

/** Fee values are given both as raw numerators (denominator 1e9) and as basis points. */
export interface FeeValue {
  numerator: string;
  bps: number;
}

/** Base fee that decays over time (slots or seconds, see the activation type). */
export interface TimeSchedulerBaseFee {
  kind: "time-scheduler";
  curve: FeeCurve;
  /** True when the fee never changes (no periods or no reduction). */
  constant: boolean;
  startingFee: FeeValue;
  /** Fee once every period has elapsed. */
  endingFee: FeeValue;
  numberOfPeriods: number;
  /** Length of one period, in slots or seconds. */
  periodFrequency: string;
  reductionFactor: string;
}

/** Base fee that decays as the price moves up from the initial price. */
export interface MarketCapSchedulerBaseFee {
  kind: "market-cap-scheduler";
  curve: FeeCurve;
  constant: boolean;
  startingFee: FeeValue;
  endingFee: FeeValue;
  numberOfPeriods: number;
  /** Price step (in sqrt price bps) that advances one period. */
  sqrtPriceStepBps: number;
  /** After this duration (slots or seconds) the scheduler stops and the ending fee applies. */
  schedulerExpirationDuration: number;
  reductionFactor: string;
}

/** Base fee that grows with trade size during a limited window after activation. */
export interface RateLimiterBaseFee {
  kind: "rate-limiter";
  /** True when the limiter never raises the fee. */
  constant: boolean;
  startingFee: FeeValue;
  feeIncrementBps: number;
  maxFeeBps: number;
  /** Window after activation (slots or seconds) during which the limiter applies. */
  maxLimiterDuration: number;
  /** Input amount of token B (base units) above which the fee grows. Only B-to-A trades are limited. */
  referenceAmount: string;
}

export interface UnknownBaseFee {
  kind: "unknown";
  /** Raw base fee mode byte. */
  mode: number;
}

export type BaseFeeClassification =
  TimeSchedulerBaseFee | MarketCapSchedulerBaseFee | RateLimiterBaseFee | UnknownBaseFee;

export interface DynamicFeeClassification {
  enabled: boolean;
  binStep: number;
  filterPeriod: number;
  decayPeriod: number;
  reductionFactor: number;
  maxVolatilityAccumulator: number;
  variableFeeControl: number;
}

export interface FeeCollection {
  mode: CollectFeeModeKind;
  /** Share of LP fees reinvested into liquidity, only for compounding mode. */
  compoundingFeeBps: number | null;
}
