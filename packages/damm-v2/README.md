# @lpkit-sol/damm-v2

Read-only helpers for Meteora DAMM v2 pools. Part of [lpkit](https://github.com/lpkit-sol/lpkit).

> Independent, unofficial project. Not affiliated with Meteora.

**Pre-alpha (0.x).** The API may change.

```bash
npm install @lpkit-sol/damm-v2 @meteora-ag/cp-amm-sdk @coral-xyz/anchor@^0.31 @solana/web3.js@^1 @solana/spl-token@^0.4
```

Peer dependencies: `@meteora-ag/cp-amm-sdk` (^1.5.1), `@coral-xyz/anchor` (^0.31), `@solana/web3.js` (v1) and `@solana/spl-token` (^0.4, used by the token compatibility check).

## Pool classifier

Turns a DAMM v2 pool account into readable fields: fee collection mode, base fee schedule (constant, time-based, market-cap-based or rate limiter) with its starting and ending fee, dynamic fee, price range, pool type, activation, token programs and permanently locked liquidity.

```ts
import { Connection } from "@solana/web3.js";
import { fetchPoolClassification } from "@lpkit-sol/damm-v2/classify";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const pool = await fetchPoolClassification(connection, "<pool address>");

pool.feeCollection.mode; // "both-tokens" | "only-token-b" | "compounding"
pool.feeSchedule; // "constant" | "decaying-linear" | "market-cap-exponential" | ...
pool.baseFee.startingFee.bps; // e.g. 5000 (50%)
```

Already have the pool state from the Meteora SDK? Classify it without another RPC call:

```ts
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { classifyPool } from "@lpkit-sol/damm-v2/classify";

const state = await new CpAmm(connection).fetchPoolState(poolAddress);
const pool = classifyPool(poolAddress, state);
```

Or decode raw account bytes you already fetched with `decodePoolAccount(data)`.

## Fee presets

DAMM v2 pools are created from config accounts that fix the fees. Configs whose pool creator authority is the default key are public: anyone can create a pool from them. `fetchPublicFeePresets` lists them, sorted by index, with the same fee fields as the pool classifier.

```ts
import { fetchPublicFeePresets } from "@lpkit-sol/damm-v2/presets";

const presets = await fetchPublicFeePresets(connection);

// e.g. every public preset with a 1% constant fee, fees collected in token B only
const picks = presets.filter(
  (p) =>
    p.feeSchedule === "constant" &&
    p.baseFee.kind !== "unknown" &&
    p.baseFee.startingFee.bps === 100 &&
    p.feeCollection.mode === "only-token-b",
);
picks[0]?.address; // config address to pass when creating a pool
```

`fetchPublicFeePresets` uses a single `getProgramAccounts` call. Some RPC providers restrict that method. For one known config use `fetchFeePreset(connection, address)`, or `classifyConfig` with `decodeConfigAccount` on data you already have.

Dynamic configs (`configType: "dynamic"`) let the pool creator set fees, so their fee fields do not describe the resulting pools.

## Token compatibility check

Before creating a pool, check whether each token is accepted. The rules mirror the DAMM v2 program:

- SPL Token mints are always accepted.
- Token-2022 mints are accepted when every extension is `TransferFeeConfig`, `MetadataPointer`, `TokenMetadata`, or a `TransferHook` with no hook program and no authority.
- Any other extension needs a **token badge** for that mint (created by the DAMM v2 operator), unless the config has the "create pool without mint validation" permission.
- The Token-2022 native mint is never accepted.

```ts
import { fetchTokenCompatibility } from "@lpkit-sol/damm-v2/token-compat";

const token = await fetchTokenCompatibility(connection, "<mint address>");

token.status; // "supported" | "supported-with-token-badge" | "requires-token-badge" | "unsupported"
token.reasons; // e.g. ["Extension PermanentDelegate requires a token badge."]
token.transferFee?.activeBps; // e.g. 100 (1% of every transfer is withheld)
token.freezeAuthority; // non-null means token accounts, including pool vaults, can be frozen
```

`fetchTokenCompatibility` makes one `getMultipleAccounts` call (mint and token badge) and one `getEpochInfo` call. With a mint account you already have, call `checkTokenCompatibility(mint, account, { tokenBadgeExists, epoch })`.

A transfer fee does not block the pool, but every deposit, withdrawal and swap of that token moves less than the amount sent.

To check these rules against mainnet yourself (read-only, about 2 minutes on the public RPC), run from the repository root after `npm run build`:

```bash
npm run verify:token-compat -w @lpkit-sol/damm-v2
```

It samples 400 Token-2022 mints already used in DAMM v2 pools and 400 mints that hold a token badge, and reports how many match the expected status.

## Notes

- Fees are reported as raw numerators (denominator 1e9) and as basis points.
- u64 and u128 values are returned as decimal strings to avoid precision loss.
- Values the classifier does not recognise are reported as `"unknown"` instead of guessed.
- The type declarations shipped with `@meteora-ag/cp-amm-sdk` 1.5.1 fail TypeScript's library check on their own. Keep `skipLibCheck: true` (the usual default) in your `tsconfig.json`.
- `permanentlyLockedPercent` covers permanent locks only. Vesting locks live on positions, not on the pool.
