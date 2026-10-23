import type {
  ActivationKind,
  BaseFeeClassification,
  DynamicFeeClassification,
  FeeCollection,
  FeeSchedule,
  PriceRangeKind,
} from "../shared/types.js";

/**
 * - `static`: new pools copy every parameter from the config.
 * - `dynamic`: the pool creator sets the fees; the config's fee fields are not used.
 */
export type ConfigTypeKind = "static" | "dynamic" | "unknown";

/** A DAMM v2 config account: the fee preset a pool is created from. */
export interface DammV2FeePreset {
  protocol: "meteora-damm-v2";
  /** Config account address (base58). Pass this when creating a pool from the preset. */
  address: string;
  /** Index used to derive the config address. */
  index: string;
  /** True when anyone can create pools from this config. */
  public: boolean;
  /** Only this account can create pools from the config, or null when public. */
  poolCreatorAuthority: string | null;
  configType: ConfigTypeKind;
  feeCollection: FeeCollection;
  /** One-word summary of `baseFee`. */
  feeSchedule: FeeSchedule;
  baseFee: BaseFeeClassification;
  dynamicFee: DynamicFeeClassification;
  /** Share of each trading fee that goes to the protocol (0-100). */
  protocolFeePercent: number;
  /** Share of the protocol fee paid to a referrer when the swap includes one (0-100). */
  referralFeePercent: number;
  /** Whether pools from this config schedule fees and activation by slot or by timestamp. */
  activationType: ActivationKind;
  priceRange: PriceRangeKind;
  /** Alpha vault config attached to the preset, or null. */
  alphaVaultConfig: string | null;
  permissions: {
    /** Pools may be created without the usual mint and token badge checks. */
    createPoolWithoutMintValidation: boolean;
  };
}
