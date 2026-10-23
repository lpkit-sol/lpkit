# lpkit

> **Independent, unofficial project.** lpkit is not affiliated with, endorsed by, or maintained by Meteora. "Meteora", "DAMM" and "DLMM" are referenced only to describe compatibility.

Open-source toolkit for developers building liquidity-provider (LP) tools on Solana. It starts with **Meteora DAMM v2** and is designed so new pool types can be added as separate adapters.

## Status

**Pre-alpha. Nothing is published yet.** There is no npm package and no stable API. Expect breaking changes.

## Planned scope

Read-only building blocks first:

- **Pool classifier**: decode a DAMM v2 pool account into readable fields (fee collection mode, fee scheduler, compounding, lock, pool type).
- **Fee presets**: list and decode the public fee configurations (Constant, Decaying linear/exponential, Market Cap).
- **Token compatibility check**: detect Token-2022 extensions (transfer fee, transfer hook, permissioned) that block or change DAMM v2 pools.
- **Position reader**: read positions, plus builders for claim and batch-close instructions.

Support for other Meteora products will only be added after their official documentation is public.

## Design principles

- **Neutral core, protocol adapters.** Shared types for pools and positions live in a core; each protocol gets its own adapter.
- **No hidden I/O.** Functions take the RPC connection and data as arguments. They never read environment variables or config files.
- **No keys required.** Read-only features work against public mainnet accounts. lpkit never asks for a private key.

## Contributing

Issues and discussion are welcome while the structure is being defined. Never include private keys, seed phrases, API keys or RPC URLs with tokens in issues, pull requests or commits.

## License

[Apache-2.0](LICENSE)
