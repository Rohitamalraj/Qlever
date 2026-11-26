import { defineChain, encodeAbiParameters, decodeAbiParameters, keccak256, hexToBytes, bytesToHex, parseAbi, type Hex } from "viem";
import { seal, open, recipientOf, sealKeysFromSeed, type SealKeyPair } from "@qorechain/qoreseal";
import { fetchMlkemPublicKey } from "@qorechain/qoreseal/network";

// ─── Network ────────────────────────────────────────────────────────────────
export const CHAIN_NAME = "qorechain-diana";
export const REST_URL = process.env.NEXT_PUBLIC_QORE_REST || "https://api-testnet.qore.host";
export const EVM_RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://evm-testnet.qore.host";
export const EXPLORER = "https://explore.qore.network";

export const qoreTestnet = defineChain({
  id: 9800,
  name: "QoreChain Diana",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
  blockExplorers: { default: { name: "QoreChain Explorer", url: EXPLORER } },
  testnet: true,
});

// ─── Deployment ─────────────────────────────────────────────────────────────
const a = (v: string | undefined) => (v || "") as Hex;
export const CONTRACTS = {
  vault: a(process.env.NEXT_PUBLIC_VAULT_ADDRESS),
  feed: a(process.env.NEXT_PUBLIC_FEED_ADDRESS),
  tiers: a(process.env.NEXT_PUBLIC_TIERS_ADDRESS),
  keeper: a(process.env.NEXT_PUBLIC_KEEPER_ADDRESS),
};
export const isDeployed = () => !!CONTRACTS.vault && !!CONTRACTS.feed;
/** Block to start scanning PositionOpened logs from (the deploy block keeps getLogs cheap). */
export const FROM_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || "0");

export const vaultAbi = parseAbi([
  "event PositionOpened(uint256 indexed id, address indexed trader, uint256 collateral, bytes32 commitment, bytes envelope)",
  "event PositionLiquidated(uint256 indexed id, bytes32 asset, uint16 leverage, bool isLong, uint256 liqPrice, uint256 price, bool tierViolationOnly)",
  "event PositionClosed(uint256 indexed id, uint256 returned, bool forfeited)",
  "function openPosition(bytes32 commitment, bytes envelope) payable returns (uint256)",
  "function liquidate(uint256 id, (bytes32 asset, uint256 entryPrice, uint16 leverage, bool isLong, uint256 liqPrice, bytes32 nonce) r)",
  "function closePosition(uint256 id, (bytes32 asset, uint256 entryPrice, uint16 leverage, bool isLong, uint256 liqPrice, bytes32 nonce) r)",
  "function positions(uint256) view returns (address owner, uint256 collateral, bytes32 commitment, uint64 openedAt, bool open)",
  "function poolStats() view returns (uint256 locked, uint256 openCount, uint256 forfeited)",
  "function keeper() view returns (address)",
]);
export const feedAbi = parseAbi(["function latestPrice(bytes32 asset) view returns (uint256 price, uint256 publishTime)"]);
export const tierAbi = parseAbi([
  "function maxLeverage(address trader) view returns (uint16)",
  "function effectiveTier(address trader) view returns (uint8)",
  "function credentialOf(address trader) view returns (uint8 tier, uint64 expiry)",
  "function maxLeverageOfTier(uint8 tier) view returns (uint16)",
  "function claimTier(uint8 tier, uint64 expiry, bytes sig)",
]);

/** Tier ladder shared with the contract defaults and the verification modal. */
export const TIERS = [
  { tier: 4, label: "Institutional", cap: 10, rule: "Credit score 80-100" },
  { tier: 3, label: "Premium HNW", cap: 8, rule: "Credit score 60-79" },
  { tier: 2, label: "Accredited Investor", cap: 5, rule: "Credit score 35-59" },
  { tier: 1, label: "Basic", cap: 2, rule: "Credit score 0-34" },
] as const;
export const tierLabel = (t: number) => TIERS.find((x) => x.tier === t)?.label ?? "Unverified";

// ─── Commit / seal (must match QleverVault.computeCommitment and services/src/position.ts) ──
export const SEAL_PURPOSE = "qlever-position";
export const PRICE_DECIMALS = 8;

export interface PositionFields {
  asset: Hex; // bytes32 ticker, e.g. bytes32("AAPL"); sealed together with the rest
  entryPrice: bigint; // 8 decimals: the on-chain oracle price at open; verified against the oracle's recorded range at reveal
  leverage: number;
  isLong: boolean;
  liqPrice: bigint; // 8 decimals
  nonce: Hex;
}

const PARAMS = [{ type: "bytes32" }, { type: "uint256" }, { type: "uint16" }, { type: "bool" }, { type: "uint256" }, { type: "bytes32" }] as const;
const tuple = (f: PositionFields) => [f.asset, f.entryPrice, f.leverage, f.isLong, f.liqPrice, f.nonce] as const;

export function computeCommitment(f: PositionFields): Hex {
  return keccak256(encodeAbiParameters(PARAMS, tuple(f)));
}

export function randomNonce(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export const toE8 = (n: number) => BigInt(Math.round(n * 10 ** PRICE_DECIMALS));
export const fromE8 = (n: bigint) => Number(n) / 10 ** PRICE_DECIMALS;

/** The message a trader signs to derive their QoreSeal keys. Never leaves the browser. */
export const SEAL_KEY_MESSAGE =
  "Qlever: derive my QoreSeal decryption keys.\nOnly sign this on the Qlever app. It does not move funds.";

export async function sealKeysFromSignature(signature: Hex): Promise<SealKeyPair> {
  const seed = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(hexToBytes(signature))));
  return sealKeysFromSeed(seed);
}

/**
 * Encrypt the sensitive fields client-side to two registered recipients: the trader and the Keeper.
 * The Keeper's ML-KEM-1024 key is read from QoreChain's on-chain registry; the commitment is bound as AAD.
 */
export async function sealPosition(f: PositionFields, trader: SealKeyPair, keeperAddress: string) {
  const keeperKey = await fetchMlkemPublicKey({ rest: REST_URL, address: keeperAddress });
  const commitment = computeCommitment(f);
  const envelope = seal({
    chainId: CHAIN_NAME,
    purpose: SEAL_PURPOSE,
    mode: "mlkem",
    recipients: [recipientOf(trader), { mlkemPublicKey: keeperKey }],
    plaintext: hexToBytes(encodeAbiParameters(PARAMS, tuple(f))),
    aad: hexToBytes(commitment),
  });
  return { commitment, envelope: bytesToHex(envelope) as Hex };
}

/** Decrypt a PositionOpened envelope and verify it against the on-chain commitment. */
export function openEnvelope(envelope: Hex, commitment: Hex, keys: SealKeyPair): PositionFields {
  const pt = open({
    chainId: CHAIN_NAME,
    purpose: SEAL_PURPOSE,
    envelope: hexToBytes(envelope),
    keys,
    aad: hexToBytes(commitment),
  });
  const [asset, entryPrice, leverage, isLong, liqPrice, nonce] = decodeAbiParameters(PARAMS, bytesToHex(pt));
  const f: PositionFields = { asset, entryPrice, leverage, isLong, liqPrice, nonce };
  if (computeCommitment(f) !== commitment) throw new Error("decrypted fields do not match the on-chain commitment");
  return f;
}

/** The tuple the vault's liquidate/closePosition take (struct Reveal). */
export const toReveal = (f: PositionFields) => ({
  asset: f.asset, entryPrice: f.entryPrice, leverage: f.leverage, isLong: f.isLong, liqPrice: f.liqPrice, nonce: f.nonce,
});

/** Mirrors QleverVault._crossed. */
export const isCrossed = (isLong: boolean, liqPrice: bigint, price: bigint) => (isLong ? price <= liqPrice : price >= liqPrice);

/** Default liquidation price for a leverage multiple, with a 0.5% maintenance buffer. */
export function suggestLiqPrice(entry: number, leverage: number, isLong: boolean): number {
  const move = (1 / leverage) * 0.995;
  return isLong ? entry * (1 - move) : entry * (1 + move);
}
