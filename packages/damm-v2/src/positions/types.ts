/** A pool token as seen from a position. `decimals` is null when the mint was not read. */
export interface PositionToken {
  mint: string;
  decimals: number | null;
}

/** Token amounts in raw base units (divide by 10^decimals for display). */
export interface TokenPair {
  tokenA: string;
  tokenB: string;
}

/** One vesting schedule locking part of a position's liquidity. Points are slots or seconds, per the pool's activation type. */
export interface PositionVesting {
  /** `position` for the schedule stored on the position itself, `vesting-account` for a separate Vesting account. */
  source: "position" | "vesting-account";
  /** The Vesting account address, or null for the position's own schedule. */
  address: string | null;
  cliffPoint: string;
  periodFrequency: string;
  numberOfPeriods: number;
  cliffUnlockLiquidity: string;
  liquidityPerPeriod: string;
  totalReleasedLiquidity: string;
  /** Liquidity that can be released now, or null when no current point was given. */
  availableToRelease: string | null;
  /** Whether every period has passed, or null when no current point was given. */
  complete: boolean | null;
}

export interface PositionReward {
  /** Reward slot on the pool (0 or 1). */
  index: number;
  mint: string;
  /** Pending reward in raw base units, or null when no current time was given. */
  pending: string | null;
}

/** Readable description of a Meteora DAMM v2 position. */
export interface DammV2PositionClassification {
  protocol: "meteora-damm-v2";
  /** Position account address (base58). */
  address: string;
  pool: string;
  /** The position NFT; whoever holds it owns the position. */
  nftMint: string;
  /** Owner wallet, when known (fetchPositionsByOwner sets it). */
  owner: string | null;
  tokenA: PositionToken;
  tokenB: PositionToken;
  liquidity: {
    total: string;
    unlocked: string;
    vested: string;
    permanentlyLocked: string;
    /** This position's share of the pool's liquidity (0-100), or null for an empty pool. */
    poolSharePercent: number | null;
  };
  /** Tokens the position's liquidity is worth at the current pool price. */
  amounts: TokenPair;
  /** LP fees earned and not yet claimed. */
  unclaimedFees: TokenPair;
  /** LP fees already claimed over the position's life. */
  claimedFees: TokenPair;
  /** Only the pool's initialized reward slots. */
  rewards: PositionReward[];
  vesting: PositionVesting[];
  /** Actions a delegate may take on the position, if any were granted. */
  delegatePermissions: string[];
}
