# @lpkit-sol/damm-v2

Read-only helpers for Meteora DAMM v2 pools. Part of [lpkit](https://github.com/lpkit-sol/lpkit).

> Independent, unofficial project. Not affiliated with Meteora.

**Pre-alpha. Not published yet.** The API may change.

Peer dependencies: `@meteora-ag/cp-amm-sdk` (^1.5.1), `@coral-xyz/anchor` (^0.31) and `@solana/web3.js` (v1).

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

## Notes

- Fees are reported as raw numerators (denominator 1e9) and as basis points.
- u64 and u128 values are returned as decimal strings to avoid precision loss.
- Values the classifier does not recognise are reported as `"unknown"` instead of guessed.
- `permanentlyLockedPercent` covers permanent locks only. Vesting locks live on positions, not on the pool.
