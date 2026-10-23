import { Program, type Provider } from "@coral-xyz/anchor";
import { CpAmmIdl, type CpAmmTypes } from "@meteora-ag/cp-amm-sdk";

let coder: Program<CpAmmTypes>["coder"] | undefined;

/**
 * Account coder for the DAMM v2 program. Field names come out in camelCase,
 * matching the account types exported by `@meteora-ag/cp-amm-sdk`.
 */
export function getCoder(): Program<CpAmmTypes>["coder"] {
  // The Program is only used for its coder, so it never needs a working connection.
  coder ??= new Program<CpAmmTypes>(CpAmmIdl as CpAmmTypes, {} as Provider).coder;
  return coder;
}
