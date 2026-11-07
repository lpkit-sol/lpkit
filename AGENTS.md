# AGENTS.md

Guidance for AI coding assistants (Claude Code, Cursor, Copilot, Codex and others). The first part is for code that **uses** lpkit; the second is for work **inside** this repository.

lpkit is an independent, unofficial TypeScript toolkit for Meteora DAMM v2 on Solana. It is not affiliated with Meteora.

## Using lpkit in your project

### Install

```bash
npm install @lpkit-sol/lpkit @meteora-ag/cp-amm-sdk @coral-xyz/anchor@^0.31 @solana/web3.js@^1 @solana/spl-token@^0.4
```

The npm scope is `@lpkit-sol`. There is no unscoped `lpkit` package; do not install one.

### What exists

Everything is exported from `@lpkit-sol/lpkit` and from `@lpkit-sol/damm-v2`, and also from these subpaths:

| Subpath                           | Fetch (needs a `Connection`)              | Pure (data you already have)                                        |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `@lpkit-sol/damm-v2/classify`     | `fetchPoolClassification`                 | `classifyPool`, `decodePoolAccount`, `feeScheduleOf`                |
| `@lpkit-sol/damm-v2/presets`      | `fetchPublicFeePresets`, `fetchFeePreset` | `classifyConfig`, `decodeConfigAccount`                             |
| `@lpkit-sol/damm-v2/token-compat` | `fetchTokenCompatibility`                 | `checkTokenCompatibility`                                           |
| `@lpkit-sol/damm-v2/positions`    | `fetchPositionsByOwner`, `fetchPosition`  | `classifyPosition`, `decodePositionAccount`, `decodeVestingAccount` |

Do not invent other functions. If something is missing, say so instead of guessing an API. Details and examples are in [`packages/damm-v2/README.md`](packages/damm-v2/README.md).

### Rules that avoid common mistakes

- **Read-only.** lpkit never signs, sends transactions or asks for keys. Never ask a user for a private key or seed phrase to use it.
- **Amounts are strings in base units.** u64 and u128 values (liquidity, token amounts, fees) are decimal strings. Use `BigInt`, not `Number`, and divide by `10 ** decimals` only for display.
- **Fees** come as raw numerators (denominator 1e9) and as basis points (`bps`).
- **`"unknown"` means unknown.** Do not map it to a known case.
- **RPC limits.** `fetchPublicFeePresets` and the Vesting lookup in the position reader use `getProgramAccounts`; `fetchPositionsByOwner` uses `getTokenAccountsByOwner`. Many free public RPCs refuse these. Pass `{ vestingAccounts: false }` (fourth argument) to skip the Vesting lookup, or use an RPC that allows them.
- **Never hardcode an RPC URL that contains an API key.** Read it from the user's own configuration.
- `@meteora-ag/cp-amm-sdk` 1.5.1 types need `skipLibCheck: true` in `tsconfig.json`.
- 0.x: the API can change between minor versions. Check [`CHANGELOG.md`](CHANGELOG.md).

## Working in this repository

Read [`CONTRIBUTING.md`](CONTRIBUTING.md); its ground rules apply to you too. In short:

- **No secrets, ever:** no private keys, seed phrases, `.env` files, API keys or RPC URLs with tokens in code, tests, fixtures, issues or commits. gitleaks runs before every commit and in CI; never bypass the hook.
- **Read-only RPC only.** Never send a transaction. Anything that builds one must return unsigned instructions.
- **No hidden I/O.** Functions take the connection and data as arguments; no environment variables or config files.
- **Follow the program, cite the source.** Reuse the Meteora SDK's math instead of reimplementing it, and say which on-chain or SDK function a behaviour mirrors.
- **Never invent numbers.** Expected values in tests come from real mainnet fixtures and, when possible, an independent cross-check. Say when something was not verified.
- **Before you finish:** run `npm run check` (build, typecheck, lint, format check, tests). It must pass.
- **Commits:** English, imperative mood, one change per commit. Do not publish to npm; maintainers do that.

Layout: `packages/core` (protocol-neutral types), `packages/damm-v2` (Meteora DAMM v2), `packages/lpkit` (re-exports), `apps/dashboard` (public read-only page, not on npm). Tests and fixtures live in `packages/*/test`.
