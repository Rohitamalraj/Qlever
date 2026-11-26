import { encodeAbiParameters, decodeAbiParameters, keccak256, hexToBytes, bytesToHex, type Hex } from "viem";
import { seal, open, recipientOf, generateSealKeys } from "@qorechain/qoreseal";

type SealKeys = ReturnType<typeof generateSealKeys>;

export const CHAIN_ID = "qorechain-diana";
export const PURPOSE = "qlever-position";

export interface PositionFields {
  asset: Hex; // bytes32 ticker (see assets.ts)
  entryPrice: bigint; // 8 decimals: the oracle price when the position was opened
  leverage: number; // uint16
  isLong: boolean;
  liqPrice: bigint; // 8 decimals
  nonce: Hex; // bytes32
}

const PARAMS = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "uint16" },
  { type: "bool" },
  { type: "uint256" },
  { type: "bytes32" },
] as const;

const tuple = (f: PositionFields) => [f.asset, f.entryPrice, f.leverage, f.isLong, f.liqPrice, f.nonce] as const;

/** Must match QleverVault.computeCommitment. */
export function computeCommitment(f: PositionFields): Hex {
  return keccak256(encodeAbiParameters(PARAMS, tuple(f)));
}

export function randomNonce(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** Seal the position fields to the trader and the Keeper. The commitment is bound in as AAD. */
export function sealPosition(f: PositionFields, trader: SealKeys, keeperRecipient: ReturnType<typeof recipientOf>) {
  const commitment = computeCommitment(f);
  const envelope = seal({
    chainId: CHAIN_ID,
    purpose: PURPOSE,
    mode: "mlkem",
    recipients: [recipientOf(trader), keeperRecipient],
    plaintext: hexToBytes(encodeAbiParameters(PARAMS, tuple(f))),
    aad: hexToBytes(commitment),
  });
  return { commitment, envelope: bytesToHex(envelope) };
}

/** Decrypt an envelope from a PositionOpened event and verify it against the on-chain commitment. */
export function openPosition(envelope: Hex, commitment: Hex, keys: SealKeys): PositionFields {
  const pt = open({
    chainId: CHAIN_ID,
    purpose: PURPOSE,
    envelope: hexToBytes(envelope),
    keys,
    aad: hexToBytes(commitment),
  });
  const [asset, entryPrice, leverage, isLong, liqPrice, nonce] = decodeAbiParameters(PARAMS, bytesToHex(pt));
  const f = { asset, entryPrice, leverage, isLong, liqPrice, nonce } as PositionFields;
  if (computeCommitment(f) !== commitment) throw new Error("decrypted fields do not match commitment");
  return f;
}

/** The tuple the vault's liquidate/closePosition take (struct Reveal). */
export const toReveal = (f: PositionFields) => ({
  asset: f.asset, entryPrice: f.entryPrice, leverage: f.leverage, isLong: f.isLong, liqPrice: f.liqPrice, nonce: f.nonce,
});
