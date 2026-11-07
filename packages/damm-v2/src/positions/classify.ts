import { BN } from "@coral-xyz/anchor";
import {
  PositionDelegatePermission,
  getAmountAFromLiquidityDelta,
  getAmountBFromLiquidityDelta,
  getAvailableVestingLiquidity,
  getUnClaimLpFee,
  isVestingComplete,
  positionLiquidity,
  type InnerVesting,
  type PoolState,
  type PositionState,
  type VestingState,
} from "@meteora-ag/cp-amm-sdk";
import type { PublicKey } from "@solana/web3.js";
import type { DammV2PositionClassification, PositionVesting } from "./types.js";

const ROUND_DOWN = 1;

export interface ClassifyPositionOptions {
  /** Current unix time in seconds; needed to compute pending rewards. */
  currentTime?: number | bigint;
  /** Current point in the pool's activation unit (slot or unix seconds); needed for vesting progress. */
  currentPoint?: number | bigint;
  /** Separate Vesting accounts that belong to this position. */
  vestings?: { address: PublicKey | string; state: VestingState }[];
  /** Owner wallet, when known. */
  owner?: PublicKey | string;
  /** Token decimals, when known. */
  decimals?: { tokenA?: number; tokenB?: number };
}

const toBase58 = (key: PublicKey | string) => (typeof key === "string" ? key : key.toBase58());

function hasSchedule(v: InnerVesting): boolean {
  return v.numberOfPeriod > 0 || !v.cliffUnlockLiquidity.isZero();
}

function describeVesting(
  source: PositionVesting["source"],
  address: string | null,
  inner: InnerVesting,
  currentPoint: BN | null,
): PositionVesting {
  const wrapped = { innerVesting: inner } as VestingState;
  return {
    source,
    address,
    cliffPoint: inner.cliffPoint.toString(),
    periodFrequency: inner.periodFrequency.toString(),
    numberOfPeriods: inner.numberOfPeriod,
    cliffUnlockLiquidity: inner.cliffUnlockLiquidity.toString(),
    liquidityPerPeriod: inner.liquidityPerPeriod.toString(),
    totalReleasedLiquidity: inner.totalReleasedLiquidity.toString(),
    availableToRelease: currentPoint
      ? getAvailableVestingLiquidity(wrapped, currentPoint).toString()
      : null,
    complete: currentPoint ? isVestingComplete(wrapped, currentPoint) : null,
  };
}

function delegatePermissions(mask: number): string[] {
  return Object.entries(PositionDelegatePermission)
    .filter(([, bit]) => typeof bit === "number" && (mask & (1 << bit)) !== 0)
    .map(([name]) => name);
}

function sharePercent(part: BN, total: BN): number | null {
  if (total.isZero()) return null;
  return part.muln(10_000).div(total).toNumber() / 100;
}

/**
 * Describe a DAMM v2 position in readable terms.
 *
 * Pure function: pass the position, its pool's state and, optionally, the
 * current time and point. Amounts are raw base units. Unclaimed fees and
 * token amounts use the Meteora SDK's own math.
 */
export function classifyPosition(
  address: PublicKey | string,
  position: PositionState,
  pool: PoolState,
  options: ClassifyPositionOptions = {},
): DammV2PositionClassification {
  const total = positionLiquidity(position);
  const currentTime =
    options.currentTime === undefined ? null : new BN(options.currentTime.toString());
  const currentPoint =
    options.currentPoint === undefined ? null : new BN(options.currentPoint.toString());
  // The SDK throws when the time is before a reward's last update (no time
  // given, or a block time slightly behind the pool). Clamp so that elapsed
  // reward time is never negative; fees do not depend on time.
  const feeTime = pool.rewardInfos.reduce(
    (t, r) => (r.initialized !== 0 && r.lastUpdateTime.gt(t) ? r.lastUpdateTime : t),
    currentTime ?? new BN(0),
  );
  const unclaimed = getUnClaimLpFee(pool, position, feeTime);

  const amountA = getAmountAFromLiquidityDelta(
    pool.sqrtPrice,
    pool.sqrtMaxPrice,
    total,
    ROUND_DOWN,
    pool.collectFeeMode,
    pool.tokenAAmount,
    pool.liquidity,
  );
  const amountB = getAmountBFromLiquidityDelta(
    pool.sqrtMinPrice,
    pool.sqrtPrice,
    total,
    ROUND_DOWN,
    pool.collectFeeMode,
    pool.tokenBAmount,
    pool.liquidity,
  );

  const vesting: PositionVesting[] = [];
  if (hasSchedule(position.innerVesting)) {
    vesting.push(describeVesting("position", null, position.innerVesting, currentPoint));
  }
  for (const v of options.vestings ?? []) {
    vesting.push(
      describeVesting("vesting-account", toBase58(v.address), v.state.innerVesting, currentPoint),
    );
  }

  return {
    protocol: "meteora-damm-v2",
    address: toBase58(address),
    pool: position.pool.toBase58(),
    nftMint: position.nftMint.toBase58(),
    owner: options.owner ? toBase58(options.owner) : null,
    tokenA: { mint: pool.tokenAMint.toBase58(), decimals: options.decimals?.tokenA ?? null },
    tokenB: { mint: pool.tokenBMint.toBase58(), decimals: options.decimals?.tokenB ?? null },
    liquidity: {
      total: total.toString(),
      unlocked: position.unlockedLiquidity.toString(),
      vested: position.vestedLiquidity.toString(),
      permanentlyLocked: position.permanentLockedLiquidity.toString(),
      poolSharePercent: sharePercent(total, pool.liquidity),
    },
    amounts: { tokenA: amountA.toString(), tokenB: amountB.toString() },
    unclaimedFees: {
      tokenA: unclaimed.feeTokenA.toString(),
      tokenB: unclaimed.feeTokenB.toString(),
    },
    claimedFees: {
      tokenA: position.metrics.totalClaimedAFee.toString(),
      tokenB: position.metrics.totalClaimedBFee.toString(),
    },
    rewards: pool.rewardInfos.flatMap((reward, index) =>
      reward.initialized === 0
        ? []
        : [
            {
              index,
              mint: reward.mint.toBase58(),
              pending: currentTime ? (unclaimed.rewards[index]?.toString() ?? null) : null,
            },
          ],
    ),
    vesting,
    delegatePermissions: delegatePermissions(position.delegatePermission),
  };
}
