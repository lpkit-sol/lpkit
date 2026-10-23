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
pool.baseFee.kind; // "time-scheduler" | "market-cap-scheduler" | "rate-limiter"
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

Notes:

- Fees are reported as raw numerators (denominator 1e9) and as basis points.
- u64 and u128 values are returned as decimal strings to avoid precision loss.
- Values the classifier does not recognise are reported as `"unknown"` instead of guessed.
- `permanentlyLockedPercent` covers permanent locks only. Vesting locks live on positions, not on the pool.
