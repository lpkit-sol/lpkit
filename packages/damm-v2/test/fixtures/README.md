# Test fixtures

Raw DAMM v2 accounts copied from Solana mainnet-beta through the public RPC (slot recorded in each file). They are public on-chain data and contain no keys.

- `pools.json`: pool accounts from one `getMultipleAccounts` call, picked to cover each collect fee mode, base fee mode, token program, activation type and fee version found on mainnet. Values asserted in the tests were cross-checked against Meteora's public data API on 2026-10-23.
- `configs.json`: config accounts from one `getProgramAccounts` call, picked to cover each fee schedule and collect fee mode among public presets, plus one private and one dynamic config. Meteora's data API has no config endpoint, so the tests check each address against the SDK's `deriveConfigAddress(index)` instead.
- `mints.json`: mint accounts from `getMultipleAccounts` calls: USDC (SPL Token), Token-2022 mints taken from DAMM v2 pools (no extensions, metadata only, transfer fee), mints that hold a DAMM v2 token badge, and the Token-2022 native mint. A Token-2022 mint used in an existing pool without a badge must have passed the program's mint check, which gives an independent expected result. Two transfer hook cases are built in the test by editing the hook bytes, because no mainnet example was found.

Fixtures are a snapshot: liquidity and other live fields will differ from the current chain state.
