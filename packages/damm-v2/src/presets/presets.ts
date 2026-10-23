import { CP_AMM_PROGRAM_ID, type ConfigState } from "@meteora-ag/cp-amm-sdk";
import { PublicKey, type Commitment, type Connection } from "@solana/web3.js";
import { getCoder } from "../shared/coder.js";
import {
  DEFAULT_PUBKEY,
  activationKind,
  classifyBaseFee,
  classifyDynamicFee,
  classifyFeeCollection,
  classifyPriceRange,
  feeScheduleOf,
  pick,
} from "../shared/fees.js";
import type { ConfigTypeKind, DammV2FeePreset } from "./types.js";

// Mirrors ConfigType in the DAMM v2 program (programs/cp-amm/src/state/config.rs).
const CONFIG_TYPES: readonly ConfigTypeKind[] = ["static", "dynamic"];
// Byte offset of `pool_creator_authority`: 8-byte discriminator + 32-byte `vault_config_key`.
const POOL_CREATOR_AUTHORITY_OFFSET = 40;
// Bit 0 of `permission`, see ConfigPermission in the program.
const CREATE_POOL_WITHOUT_MINT_VALIDATION = 0;

/** Decode raw config account data into the `ConfigState` shape used by `@meteora-ag/cp-amm-sdk`. */
export function decodeConfigAccount(data: Uint8Array): ConfigState {
  return getCoder().accounts.decode("config", Buffer.from(data)) as ConfigState;
}

/**
 * Describe a DAMM v2 config account in readable terms.
 *
 * Pure function: pass the config address and its decoded state.
 */
export function classifyConfig(address: PublicKey | string, state: ConfigState): DammV2FeePreset {
  const fees = state.poolFees;
  const baseFee = classifyBaseFee(fees.baseFee.data);
  const creatorAuthority = state.poolCreatorAuthority.toBase58();
  const vaultConfig = state.vaultConfigKey.toBase58();

  return {
    protocol: "meteora-damm-v2",
    address: typeof address === "string" ? address : address.toBase58(),
    index: state.index.toString(),
    public: creatorAuthority === DEFAULT_PUBKEY,
    poolCreatorAuthority: creatorAuthority === DEFAULT_PUBKEY ? null : creatorAuthority,
    configType: pick(CONFIG_TYPES, state.configType, "unknown"),
    feeCollection: classifyFeeCollection(state.collectFeeMode, fees.compoundingFeeBps),
    feeSchedule: feeScheduleOf(baseFee),
    baseFee,
    dynamicFee: classifyDynamicFee(fees.dynamicFee),
    protocolFeePercent: fees.protocolFeePercent,
    referralFeePercent: fees.referralFeePercent,
    activationType: activationKind(state.activationType),
    priceRange: classifyPriceRange(state.collectFeeMode, state.sqrtMinPrice, state.sqrtMaxPrice),
    alphaVaultConfig: vaultConfig === DEFAULT_PUBKEY ? null : vaultConfig,
    permissions: {
      createPoolWithoutMintValidation: state.permission.testn(CREATE_POOL_WITHOUT_MINT_VALIDATION),
    },
  };
}

/**
 * List every public DAMM v2 fee preset, sorted by index.
 *
 * Read-only: one `getProgramAccounts` call filtered to config accounts whose
 * pool creator authority is the default key. Some RPC providers restrict
 * `getProgramAccounts`; pass a connection to one that allows it.
 */
export async function fetchPublicFeePresets(
  connection: Connection,
  commitment?: Commitment,
): Promise<DammV2FeePreset[]> {
  const coder = getCoder().accounts;
  const accounts = await connection.getProgramAccounts(CP_AMM_PROGRAM_ID, {
    ...(commitment ? { commitment } : {}),
    filters: [
      { dataSize: coder.size("config") },
      { memcmp: coder.memcmp("config") },
      { memcmp: { offset: POOL_CREATOR_AUTHORITY_OFFSET, bytes: DEFAULT_PUBKEY } },
    ],
  });

  return accounts
    .map(({ pubkey, account }) => ({ pubkey, state: decodeConfigAccount(account.data) }))
    .sort((a, b) => a.state.index.cmp(b.state.index))
    .map(({ pubkey, state }) => classifyConfig(pubkey, state));
}

/**
 * Fetch one config account and classify it.
 *
 * Throws if the account does not exist or is not owned by the DAMM v2 program.
 */
export async function fetchFeePreset(
  connection: Connection,
  address: PublicKey | string,
  commitment?: Commitment,
): Promise<DammV2FeePreset> {
  const key = typeof address === "string" ? new PublicKey(address) : address;
  const account = await connection.getAccountInfo(key, commitment);
  if (!account) {
    throw new Error(`Config account not found: ${key.toBase58()}`);
  }
  if (!account.owner.equals(CP_AMM_PROGRAM_ID)) {
    throw new Error(
      `Account ${key.toBase58()} is owned by ${account.owner.toBase58()}, not the DAMM v2 program`,
    );
  }
  return classifyConfig(key, decodeConfigAccount(account.data));
}
