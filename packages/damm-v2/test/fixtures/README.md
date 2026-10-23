# Test fixtures

`pools.json` holds raw DAMM v2 pool accounts copied from Solana mainnet-beta with a single `getMultipleAccounts` call to the public RPC (slot recorded in the file). They are public on-chain data and contain no keys.

Pools were picked to cover each collect fee mode, base fee mode, token program, activation type and fee version found on mainnet. Values asserted in the tests were cross-checked against Meteora's public data API on 2026-10-23.

Fixtures are a snapshot: liquidity and other live fields will differ from the current chain state.
