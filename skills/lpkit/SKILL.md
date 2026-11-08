---
name: lpkit
description: Read and explain Meteora DAMM v2 on Solana without signing anything, using the open-source @lpkit-sol packages. Use to explain a DAMM v2 pool in plain language (fee collection mode, decaying or market-cap fee schedule, dynamic fee, locked liquidity), pick a public fee preset (config) before creating a pool, check whether a token or Token-2022 mint is accepted by DAMM v2 or needs a token badge, or summarise a wallet's DAMM v2 LP positions (value, unclaimed fees, rewards, locked and vesting liquidity). Read-only. For creating pools, swaps, adding liquidity or claiming, use Meteora's own skill.
license: Apache-2.0
compatibility: Node.js 22+, network access to a Solana RPC. No keypair needed.
---

# lpkit: read Meteora DAMM v2

lpkit is an independent, open-source (Apache-2.0) TypeScript toolkit that turns Meteora DAMM v2 accounts into readable, typed data. It is not affiliated with Meteora. Source: https://github.com/lpkit-sol/lpkit. Free web version for non-developers: https://lpkit-sol.github.io/lpkit/

It **only reads**. It never builds, signs or sends transactions and never needs a private key. Never ask the user for a private key or seed phrase for anything in this skill.

## When to use which function

| The user wants to…                                       | Call                                                                                                             | Subpath                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Understand a pool (fees, schedule, lock, tokens)         | `fetchPoolClassification(connection, pool)`                                                                      | `@lpkit-sol/damm-v2/classify`     |
| Choose a fee preset (config) before creating a pool      | `fetchPublicFeePresets(connection)`, then filter                                                                 | `@lpkit-sol/damm-v2/presets`      |
| Read one config account                                  | `fetchFeePreset(connection, config)`                                                                             | `@lpkit-sol/damm-v2/presets`      |
| Know if a token can be used in a new pool                | `fetchTokenCompatibility(connection, mint)`                                                                      | `@lpkit-sol/damm-v2/token-compat` |
| See a wallet's LP positions                              | `fetchPositionsByOwner(connection, wallet)`                                                                      | `@lpkit-sol/damm-v2/positions`    |
| See one position                                         | `fetchPosition(connection, position)`                                                                            | `@lpkit-sol/damm-v2/positions`    |
| Already have account data from the Meteora SDK or an RPC | `classifyPool`, `classifyConfig`, `checkTokenCompatibility`, `classifyPosition` and the `decode*Account` helpers | same subpaths                     |

Everything is also exported from `@lpkit-sol/damm-v2` and `@lpkit-sol/lpkit`. These are the only public functions (plus `feeScheduleOf`). Do not invent others; if something is missing, say so.

The position reader (`/positions`) was added in 0.3.0. If the installed version is older, upgrade or say it is unavailable.

## Install

```bash
npm install @lpkit-sol/lpkit @meteora-ag/cp-amm-sdk @coral-xyz/anchor@^0.31 @solana/web3.js@^1 @solana/spl-token@^0.4
```

The scope is `@lpkit-sol`. There is no unscoped `lpkit` package; never install one. Keep `skipLibCheck: true` in `tsconfig.json` (the Meteora SDK's own types fail the library check).

## Examples

Use the user's RPC URL from their configuration (environment variable or config file). Never write an RPC URL that contains an API key into code.

### Explain a pool

```ts
import { Connection } from "@solana/web3.js";
import { fetchPoolClassification } from "@lpkit-sol/damm-v2/classify";

const connection = new Connection(process.env.RPC_URL!, "confirmed");
const pool = await fetchPoolClassification(connection, poolAddress);

pool.feeCollection.mode; // "both-tokens" | "only-token-b" | "compounding" | "unknown"
pool.feeSchedule; // "constant" | "decaying-linear" | "decaying-exponential" | "market-cap-linear" | "market-cap-exponential" | "rate-limiter" | "unknown"
pool.baseFee; // kind, startingFee.bps, endingFee.bps, numberOfPeriods, periodFrequency, …
pool.dynamicFee.enabled; // fee rises with volatility
pool.liquidity.permanentlyLockedPercent; // permanent locks only; vesting lives on positions
pool.tokenA.tokenProgram; // "spl-token" | "token-2022"
```

Explain it in words, for example: "The fee starts at 50% and decays exponentially to about 6% over 120 periods of 60 seconds; fees are collected in token B only." Periods are slots when `pool.activation.type` is `"slot"` and seconds when it is `"timestamp"`.

### Pick a public fee preset

```ts
import { fetchPublicFeePresets } from "@lpkit-sol/damm-v2/presets";

const presets = await fetchPublicFeePresets(connection); // one getProgramAccounts call
const picks = presets.filter(
  (p) =>
    p.configType === "static" &&
    p.feeSchedule === "constant" &&
    p.baseFee.kind !== "unknown" &&
    p.baseFee.startingFee.bps === 100 &&
    p.feeCollection.mode === "only-token-b",
);
picks[0]?.address; // config address to pass to Meteora's create-pool call
```

Ignore the fee fields of `configType: "dynamic"` presets: the pool creator sets the fees. Do not quote a fixed number of presets; it changes as Meteora adds configs.

### Check a token before creating a pool

```ts
import { fetchTokenCompatibility } from "@lpkit-sol/damm-v2/token-compat";

const token = await fetchTokenCompatibility(connection, mint);

token.status; // "supported" | "supported-with-token-badge" | "requires-token-badge" | "unsupported"
token.reasons; // plain-English reasons, show them to the user
token.transferFee?.activeBps; // every transfer of this token withholds this fee
token.freezeAuthority; // non-null: token accounts, including pool vaults, can be frozen
```

The rules mirror the DAMM v2 program: SPL Token mints are accepted; Token-2022 mints are accepted only when every extension is a transfer fee, metadata pointer, token metadata, or an empty transfer hook. Any other extension needs a token badge created by the DAMM v2 operator. The Token-2022 native mint is never accepted. Do not tell users that every Token-2022 mint works.

### Summarise a wallet's positions

```ts
import { fetchPositionsByOwner } from "@lpkit-sol/damm-v2/positions";

const positions = await fetchPositionsByOwner(connection, wallet); // largest first

for (const p of positions) {
  p.amounts; // { tokenA, tokenB }: value at the current pool price, base units, rounded down
  p.unclaimedFees; // { tokenA, tokenB }
  p.claimedFees; // lifetime fees already claimed
  p.rewards; // [{ index, mint, pending }]
  p.liquidity; // { total, unlocked, vested, permanentlyLocked, poolSharePercent }
  p.vesting; // schedules with availableToRelease and complete
  p.tokenA.decimals; // from the mint, or null
}
```

Show amounts with decimals: `Number(BigInt(raw)) / 10 ** decimals` is fine for display only. Reward decimals are known only when the reward mint is one of the pool tokens.

## Rules

- **Amounts are decimal strings in base units** (u64/u128). Do math with `BigInt`; convert to `Number` only for display.
- **Fees** are raw numerators (denominator 1e9) and basis points (`bps`, 100 = 1%).
- **`"unknown"` means lpkit did not recognise a value.** Report it as unknown; never map it to a known case.
- **Snapshots, not history.** Results describe the account now. lpkit does not compute PnL, APR or past fees beyond `claimedFees`.
- **Not financial advice.** Describe pools and positions; do not recommend buying, selling or providing liquidity.

## RPC limits

Some calls use methods that many free public RPCs refuse:

| Method                    | Used by                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| `getProgramAccounts`      | `fetchPublicFeePresets`; Vesting account lookup in the position reader |
| `getTokenAccountsByOwner` | `fetchPositionsByOwner`                                                |

If the RPC refuses (seen on mainnet: HTTP 403 with "Access forbidden" or "Indexed requests require a personal token"), tell the user they need an RPC that allows it, usually a provider key. For positions, `fetchPosition` works with a position address, and passing `{ vestingAccounts: false }` as the fourth argument skips the Vesting lookup (`vesting` then omits separate Vesting accounts). Avoid tight loops on public RPCs; they rate-limit.

## Writing transactions

lpkit does not create pools, swap, add or remove liquidity, or claim. For those, use Meteora's SDK (`@meteora-ag/cp-amm-sdk`) or Meteora's official agent skill, and have the user review and sign every transaction in their own wallet. lpkit's output (a config address, a token check, unclaimed fees) is a good input to that step.

## More

- Package docs: https://github.com/lpkit-sol/lpkit/tree/main/packages/damm-v2
- Changelog: https://github.com/lpkit-sol/lpkit/blob/main/CHANGELOG.md
- The API is 0.x and can change between minor versions.
