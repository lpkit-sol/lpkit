# lpkit

[![CI](https://github.com/lpkit-sol/lpkit/actions/workflows/ci.yml/badge.svg)](https://github.com/lpkit-sol/lpkit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@lpkit-sol/damm-v2?label=%40lpkit-sol%2Fdamm-v2)](https://www.npmjs.com/package/@lpkit-sol/damm-v2)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

> **Independent, unofficial project.** lpkit is not affiliated with, endorsed by, or maintained by Meteora. "Meteora", "DAMM" and "DLMM" are referenced only to describe compatibility.

Open-source toolkit for developers building liquidity-provider (LP) tools on Solana. It starts with **Meteora DAMM v2** and is designed so new pool types can be added as separate adapters.

## Status

**Pre-alpha (0.x).** The API is not stable yet. Expect breaking changes between minor versions.

```bash
npm install @lpkit-sol/lpkit @meteora-ag/cp-amm-sdk @coral-xyz/anchor@^0.31 @solana/web3.js@^1 @solana/spl-token@^0.4
```

| Package                                  | Contents                                                           |
| ---------------------------------------- | ------------------------------------------------------------------ |
| [`@lpkit-sol/lpkit`](packages/lpkit)     | Re-exports every package below                                     |
| [`@lpkit-sol/core`](packages/core)       | Protocol-neutral types                                             |
| [`@lpkit-sol/damm-v2`](packages/damm-v2) | Meteora DAMM v2: pool classifier, fee presets, token compatibility |

## Example

Classify a mainnet DAMM v2 pool with one RPC call:

```ts
import { Connection } from "@solana/web3.js";
import { fetchPoolClassification } from "@lpkit-sol/lpkit";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const pool = await fetchPoolClassification(
  connection,
  "15Y6uBZRxkNxXdfMnKAksfwnWEzzntRSuqEtBkqWhNr",
);
```

Output (trimmed):

```json
{
  "tokenA": {
    "mint": "FGAWSvB1VnDZp4dCTmQNpgwYAxt5cWacaL4HHX7Hpump",
    "tokenProgram": "token-2022"
  },
  "tokenB": { "mint": "So11111111111111111111111111111111111111112", "tokenProgram": "spl-token" },
  "poolType": "permissionless",
  "feeCollection": { "mode": "only-token-b", "compoundingFeeBps": null },
  "feeSchedule": "decaying-exponential",
  "baseFee": {
    "kind": "time-scheduler",
    "curve": "exponential",
    "startingFee": { "numerator": "500000000", "bps": 5000 },
    "endingFee": { "numerator": "60100362", "bps": 601.00362 },
    "numberOfPeriods": 120,
    "periodFrequency": "60"
  },
  "dynamicFee": { "enabled": true },
  "priceRange": "full",
  "activation": { "type": "timestamp", "point": "1775891687" }
}
```

The fee starts at 50% and decays over 120 periods of 60 seconds to about 6.01%, with fees collected in SOL only. List every public fee preset with `fetchPublicFeePresets(connection)`; see the [`@lpkit-sol/damm-v2` README](packages/damm-v2) for details.

## Scope

Read-only building blocks first:

- **Pool classifier** _(released in 0.1.0, see [`@lpkit-sol/damm-v2`](packages/damm-v2#pool-classifier))_: decode a DAMM v2 pool account into readable fields (fee collection mode, fee scheduler, compounding, lock, pool type).
- **Fee presets** _(released in 0.1.0, see [`@lpkit-sol/damm-v2`](packages/damm-v2#fee-presets))_: list and decode the public fee configurations (Constant, Decaying linear/exponential, Market Cap).
- **Token compatibility check** _(released in 0.2.0, see [`@lpkit-sol/damm-v2`](packages/damm-v2#token-compatibility-check))_: detect Token-2022 extensions (transfer fee, transfer hook, permissioned) that block or change DAMM v2 pools.
- **Position reader** _(planned)_: read positions, plus builders for claim and batch-close instructions.

Support for other Meteora products will only be added after their official documentation is public.

## Design principles

- **Neutral core, protocol adapters.** Shared types for pools and positions live in a core; each protocol gets its own adapter.
- **No hidden I/O.** Functions take the RPC connection and data as arguments. They never read environment variables or config files.
- **No keys required.** Read-only features work against public mainnet accounts. lpkit never asks for a private key.

## Contributing

Issues, feedback and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Never include private keys, seed phrases, API keys or RPC URLs with tokens in issues, pull requests or commits. To report a security problem, see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
