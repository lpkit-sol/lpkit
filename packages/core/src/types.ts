/** Token program that owns a mint. */
export type TokenProgramKind = "spl-token" | "token-2022";

/** One side of a two-token pool. Addresses are base58 strings. */
export interface PoolToken {
  mint: string;
  tokenProgram: TokenProgramKind;
}

/**
 * Fields every protocol adapter reports for a pool.
 * Adapters extend this with protocol-specific details.
 */
export interface PoolSummary {
  /** Adapter identifier, e.g. "meteora-damm-v2". */
  protocol: string;
  /** Pool account address (base58). */
  address: string;
  tokenA: PoolToken;
  tokenB: PoolToken;
}
