import type { PoolSummary } from "@lpkit-sol/core";

export type CollectFeeModeKind = "both-tokens" | "only-token-b" | "compounding" | "unknown";
export type PoolTypeKind = "permissionless" | "customizable" | "unknown";
export type PoolStatusKind = "enabled" | "disabled" | "unknown";
export type ActivationKind = "slot" | "timestamp" | "unknown";
export type FeeCurve = "linear" | "exponential";

/**
 * How the price range is set.
 * - `full`: concentrated pool spanning the whole allowed range (MIN_SQRT_PRICE..MAX_SQRT_PRICE).
 * - `concentrated`: a narrower custom range.
 * - `none`: compounding pools use x * y = k and store no price range.
 */
export type PriceRangeKind = "full" | "concentrated" | "none";

/** Fee values are given both as raw numerators (denominator 1e9) and as basis points. */
export interface FeeValue {
  numerator: string;
  bps: number;
}

/** Base fee that decays over time (slots or seconds, see `activation`). */
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

/** Readable description of a Meteora DAMM v2 pool. */
export interface DammV2PoolClassification extends PoolSummary {
  protocol: "meteora-damm-v2";
  status: PoolStatusKind;
  poolType: PoolTypeKind;
  creator: string;
  feeCollection: {
    mode: CollectFeeModeKind;
    /** Share of LP fees reinvested into liquidity, only for compounding pools. */
    compoundingFeeBps: number | null;
  };
  baseFee: BaseFeeClassification;
  dynamicFee: DynamicFeeClassification;
  /** Upper bound for the total fee, set by the pool's fee version. */
  maxFeeBps: number | null;
  /** Share of each trading fee that goes to the protocol (0-100). */
  protocolFeePercent: number;
  /** Share of the protocol fee paid to a referrer when the swap includes one (0-100). */
  referralFeePercent: number;
  activation: {
    type: ActivationKind;
    /** Slot or unix timestamp (seconds) at which trading opens. */
    point: string;
  };
  /** Alpha vault allowed to buy before activation, or null. */
  alphaVault: string | null;
  priceRange: PriceRangeKind;
  liquidity: {
    total: string;
    permanentlyLocked: string;
    /** Share of liquidity permanently locked (0-100), or null when the pool is empty. */
    permanentlyLockedPercent: number | null;
  };
  /** Raw version bytes, useful when the program adds new layouts. */
  versions: {
    fee: number;
    layout: number;
  };
}
