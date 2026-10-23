import { Program, type Provider } from "@coral-xyz/anchor";
import { CpAmmIdl, type CpAmmTypes, type PoolState } from "@meteora-ag/cp-amm-sdk";

let coder: Program<CpAmmTypes>["coder"] | undefined;

function getCoder(): Program<CpAmmTypes>["coder"] {
  // The Program is only used for its coder, so it never needs a working connection.
  coder ??= new Program<CpAmmTypes>(CpAmmIdl as CpAmmTypes, {} as Provider).coder;
  return coder;
}

/**
 * Decode raw pool account data into the same `PoolState` shape
 * returned by `CpAmm.fetchPoolState` in `@meteora-ag/cp-amm-sdk`.
 */
export function decodePoolAccount(data: Uint8Array): PoolState {
  return getCoder().accounts.decode("pool", Buffer.from(data)) as PoolState;
}
