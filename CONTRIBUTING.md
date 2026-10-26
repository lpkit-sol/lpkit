# Contributing to lpkit

Thanks for helping. lpkit is an independent, unofficial toolkit; it is not affiliated with Meteora.

## Ground rules

- **No secrets, ever.** Never put private keys, seed phrases, `.env` files, API keys or RPC URLs with tokens in code, tests, issues or pull requests. A [gitleaks](https://github.com/gitleaks/gitleaks) scan runs before every commit and in CI.
- **Read-only by default.** Features read public on-chain data. Anything that builds transactions must return unsigned instructions and never ask for a key.
- **No hidden I/O.** Functions take the RPC connection and data as arguments. They never read environment variables or config files.
- **Report unknown values, don't guess.** When the program adds a value the code does not recognise, return `"unknown"` instead of mapping it to a known case.
- **Follow the program, cite the source.** When behaviour depends on the on-chain program, point to the Meteora source or SDK function it mirrors.

## Setup

Requirements: Node.js 22 or newer, and [gitleaks](https://github.com/gitleaks/gitleaks#installing) for the pre-commit hook.

```bash
git clone https://github.com/lpkit-sol/lpkit.git
cd lpkit
npm install
npm run check
```

`npm install` points git at the hooks in `.githooks/`. `npm run check` builds every package, then runs the typecheck, lint, format check and tests.

## Tests

Tests run offline against real mainnet accounts stored in `packages/*/test/fixtures` (public data, no keys). When you add a fixture:

1. Fetch it with a read-only RPC call (`getAccountInfo`, `getMultipleAccounts` or `getProgramAccounts`).
2. Record the source and slot in the fixture file.
3. Cross-check the asserted values against an independent source when one exists, and say which in the fixture README.

## Pull requests

- Keep each pull request to one change, with tests.
- Run `npm run check` before pushing.
- Write commit messages in English, in the imperative ("Add token compatibility check").

## Project layout

```
packages/
  core/      @lpkit-sol/core     protocol-neutral types
  damm-v2/   @lpkit-sol/damm-v2  Meteora DAMM v2 adapter
  lpkit/     @lpkit-sol/lpkit    re-exports every package
```

New protocols get their own package. Support for a new Meteora product is only added after its official documentation is public.

By contributing you agree that your contributions are licensed under [Apache-2.0](LICENSE).
