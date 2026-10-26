# Changelog

All notable changes to the published packages. Versions follow [semver](https://semver.org/); while lpkit is 0.x, a minor version may contain breaking changes.

## 0.2.0 (2026-10-26)

`@lpkit-sol/damm-v2` and `@lpkit-sol/lpkit`. `@lpkit-sol/core` is unchanged at 0.1.0.

### Added

- Token-2022 compatibility check (`@lpkit-sol/damm-v2/token-compat`): `fetchTokenCompatibility` and `checkTokenCompatibility` tell whether a mint can be used in a new DAMM v2 pool (`supported`, `supported-with-token-badge`, `requires-token-badge` or `unsupported`), with reasons, extensions, token badge, active transfer fee, transfer hook and mint/freeze authorities. The rules mirror `is_permissionless_supported_mint` and `validate_mint` in the DAMM v2 program.

### Changed

- `@lpkit-sol/damm-v2` now lists `@solana/spl-token` (^0.4) as a peer dependency. It is already installed with `@meteora-ag/cp-amm-sdk`.

## 0.1.0 (2026-10-23)

First release: `@lpkit-sol/core`, `@lpkit-sol/damm-v2` and `@lpkit-sol/lpkit`.

### Added

- Pool classifier (`@lpkit-sol/damm-v2/classify`).
- Fee presets (`@lpkit-sol/damm-v2/presets`).
