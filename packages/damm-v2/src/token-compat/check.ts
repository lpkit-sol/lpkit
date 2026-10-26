import { deriveTokenBadgeAddress } from "@meteora-ag/cp-amm-sdk";
import {
  NATIVE_MINT_2022,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getEpochFee,
  getExtensionTypes,
  getTransferFeeConfig,
  getTransferHook,
  unpackMint,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type {
  DammV2TokenCompatibility,
  TokenCompatibilityStatus,
  TokenExtension,
  TransferFeeInfo,
} from "./types.js";

// Names in ExtensionType order, from the Token-2022 interface crate (interface/src/extension/mod.rs).
const EXTENSION_NAMES: readonly string[] = [
  "Uninitialized",
  "TransferFeeConfig",
  "TransferFeeAmount",
  "MintCloseAuthority",
  "ConfidentialTransferMint",
  "ConfidentialTransferAccount",
  "DefaultAccountState",
  "ImmutableOwner",
  "MemoTransfer",
  "NonTransferable",
  "InterestBearingConfig",
  "CpiGuard",
  "PermanentDelegate",
  "NonTransferableAccount",
  "TransferHook",
  "TransferHookAccount",
  "ConfidentialTransferFeeConfig",
  "ConfidentialTransferFeeAmount",
  "MetadataPointer",
  "TokenMetadata",
  "GroupPointer",
  "TokenGroup",
  "GroupMemberPointer",
  "TokenGroupMember",
  "ConfidentialMintBurn",
  "ScaledUiAmount",
  "Pausable",
  "PausableAccount",
  "PermissionedBurn",
];

const TRANSFER_FEE_CONFIG = 1;
const TRANSFER_HOOK = 14;
// Mirrors `is_permissionless_supported_mint` in the DAMM v2 program (programs/cp-amm/src/utils/token.rs).
// TransferHook is only allowed when neither a hook program nor an authority is set.
const ALLOWED_WITHOUT_BADGE = new Set([
  TRANSFER_FEE_CONFIG,
  18 /* MetadataPointer */,
  19 /* TokenMetadata */,
]);

/** Raw mint account, as returned by `getAccountInfo`. */
export interface MintAccountInput {
  owner: PublicKey;
  data: Uint8Array;
}

export interface CheckTokenCompatibilityOptions {
  /** Whether the token badge account exists. Leave out when unknown. */
  tokenBadgeExists?: boolean;
  /** Current epoch, to report the transfer fee in effect. */
  epoch?: bigint | number;
}

function optionalKey(key: PublicKey | null): string | null {
  return key && !key.equals(PublicKey.default) ? key.toBase58() : null;
}

function transferFeeInfo(
  config: NonNullable<ReturnType<typeof getTransferFeeConfig>>,
  epoch: bigint | number | undefined,
): TransferFeeInfo {
  const { olderTransferFee: older, newerTransferFee: newer } = config;
  return {
    olderBps: older.transferFeeBasisPoints,
    olderMaximumFee: older.maximumFee.toString(),
    newerBps: newer.transferFeeBasisPoints,
    newerMaximumFee: newer.maximumFee.toString(),
    newerEpoch: newer.epoch.toString(),
    activeBps:
      epoch === undefined ? null : getEpochFee(config, BigInt(epoch)).transferFeeBasisPoints,
  };
}

/**
 * Check whether a mint can be used in a new DAMM v2 pool.
 *
 * Pure function: pass the mint address and its raw account. Throws if the
 * account is not owned by the SPL Token or Token-2022 program.
 */
export function checkTokenCompatibility(
  mint: PublicKey | string,
  account: MintAccountInput,
  options: CheckTokenCompatibilityOptions = {},
): DammV2TokenCompatibility {
  const key = typeof mint === "string" ? new PublicKey(mint) : mint;
  const isToken2022 = account.owner.equals(TOKEN_2022_PROGRAM_ID);
  if (!isToken2022 && !account.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error(
      `Account ${key.toBase58()} is owned by ${account.owner.toBase58()}, not a token program`,
    );
  }

  const parsed = unpackMint(
    key,
    { data: Buffer.from(account.data), owner: account.owner, lamports: 0, executable: false },
    account.owner,
  );
  const hook = isToken2022 ? getTransferHook(parsed) : null;
  const hookProgram = hook ? optionalKey(hook.programId) : null;
  const hookAuthority = hook ? optionalKey(hook.authority) : null;
  const feeConfig = isToken2022 ? getTransferFeeConfig(parsed) : null;

  const extensions: TokenExtension[] = isToken2022
    ? getExtensionTypes(parsed.tlvData).map((type) => ({
        type,
        name: EXTENSION_NAMES[type] ?? `unknown(${type})`,
        allowedWithoutBadge:
          ALLOWED_WITHOUT_BADGE.has(type) ||
          (type === TRANSFER_HOOK && hookProgram === null && hookAuthority === null),
      }))
    : [];

  const reasons: string[] = [];
  let status: TokenCompatibilityStatus;
  if (key.equals(NATIVE_MINT_2022)) {
    status = "unsupported";
    reasons.push("The Token-2022 native mint is not supported by DAMM v2.");
  } else {
    for (const e of extensions.filter((x) => !x.allowedWithoutBadge)) {
      reasons.push(
        e.type === TRANSFER_HOOK
          ? "TransferHook with a hook program or authority set requires a token badge."
          : `Extension ${e.name} requires a token badge.`,
      );
    }
    if (reasons.length === 0) {
      status = "supported";
      reasons.push(
        isToken2022
          ? "Every extension on this mint is accepted without a token badge."
          : "SPL Token mints are always supported.",
      );
    } else if (options.tokenBadgeExists) {
      status = "supported-with-token-badge";
      reasons.push("A token badge exists for this mint.");
    } else {
      status = "requires-token-badge";
    }
  }

  return {
    protocol: "meteora-damm-v2",
    mint: key.toBase58(),
    tokenProgram: isToken2022 ? "token-2022" : "spl-token",
    status,
    reasons,
    extensions,
    tokenBadge: {
      address: deriveTokenBadgeAddress(key).toBase58(),
      exists: options.tokenBadgeExists ?? null,
    },
    transferFee: feeConfig ? transferFeeInfo(feeConfig, options.epoch) : null,
    transferHook: hook ? { programId: hookProgram, authority: hookAuthority } : null,
    decimals: parsed.decimals,
    mintAuthority: optionalKey(parsed.mintAuthority),
    freezeAuthority: optionalKey(parsed.freezeAuthority),
  };
}
