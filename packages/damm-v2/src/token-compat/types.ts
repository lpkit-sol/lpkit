import type { TokenProgramKind } from "@lpkit-sol/core";

/**
 * Whether a mint can be used in a new DAMM v2 pool.
 * - `supported`: accepted by any config.
 * - `supported-with-token-badge`: has extensions that need a token badge, and the badge exists.
 * - `requires-token-badge`: has extensions that need a token badge, and none exists (or it was not checked).
 *   Configs with the "create pool without mint validation" permission skip this check.
 * - `unsupported`: rejected by every config (the Token-2022 native mint).
 */
export type TokenCompatibilityStatus =
  "supported" | "supported-with-token-badge" | "requires-token-badge" | "unsupported";

export interface TokenExtension {
  /** Numeric extension type from the Token-2022 program. */
  type: number;
  /** Extension name as in the Token-2022 source, or `unknown(<type>)`. */
  name: string;
  /** True when DAMM v2 accepts this extension without a token badge. */
  allowedWithoutBadge: boolean;
}

export interface TransferFeeInfo {
  /** Fee in effect before `newerEpoch`. */
  olderBps: number;
  olderMaximumFee: string;
  /** Fee in effect from `newerEpoch` onwards. */
  newerBps: number;
  newerMaximumFee: string;
  newerEpoch: string;
  /** Fee for the epoch passed in, or null when no epoch was given. */
  activeBps: number | null;
}

/** Readable description of how a mint fits DAMM v2. */
export interface DammV2TokenCompatibility {
  protocol: "meteora-damm-v2";
  mint: string;
  tokenProgram: TokenProgramKind;
  status: TokenCompatibilityStatus;
  /** One line per reason behind the status, in English. */
  reasons: string[];
  /** Mint extensions (empty for SPL Token mints). */
  extensions: TokenExtension[];
  tokenBadge: {
    /** Token badge PDA for this mint. */
    address: string;
    /** Whether the badge account exists, or null when it was not checked. */
    exists: boolean | null;
  };
  /** Present when the mint charges a transfer fee: pool amounts will differ from transfer amounts. */
  transferFee: TransferFeeInfo | null;
  /** Present when the mint has a transfer hook extension. Null fields mean no hook program or authority is set. */
  transferHook: { programId: string | null; authority: string | null } | null;
  decimals: number;
  mintAuthority: string | null;
  /** A freeze authority can freeze token accounts, including pool vaults. */
  freezeAuthority: string | null;
}
