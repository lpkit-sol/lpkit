import type { PoolSummary } from "@lpkit-sol/core";
import type {
  ActivationKind,
  BaseFeeClassification,
  DynamicFeeClassification,
  FeeCollection,
  FeeSchedule,
  PriceRangeKind,
} from "../shared/types.js";

export type PoolTypeKind = "permissionless" | "customizable" | "unknown";
export type PoolStatusKind = "enabled" | "disabled" | "unknown";

/** Readable description of a Meteora DAMM v2 pool. */
export interface DammV2PoolClassification extends PoolSummary {
  protocol: "meteora-damm-v2";
  status: PoolStatusKind;
  poolType: PoolTypeKind;
  creator: string;
  feeCollection: FeeCollection;
  /** One-word summary of `baseFee`. */
  feeSchedule: FeeSchedule;
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
