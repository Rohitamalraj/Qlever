/**
 * POST /api/kyc/issue   { address }
 *
 * Tier oracle. Scores the wallet from its on-chain activity on QoreChain
 * (transaction count and native QOR balance), maps the score to a tier, and signs { chain, registry, trader, tier, expiry }.
 * The trader submits the signature to TierRegistry.claimTier, which verifies it against the oracle address on-chain.
 * No personal data is collected or stored; only tier and expiry reach the chain.
 */
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, encodeAbiParameters, formatEther, http, isAddress, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://evm-testnet.qore.host";
const CHAIN_ID = 9800n;
const REGISTRY = process.env.NEXT_PUBLIC_TIERS_ADDRESS as Hex | undefined;
const CREDENTIAL_TTL_S = 30 * 24 * 3600; // 30 days

const client = createPublicClient({ transport: http(RPC) });

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const scoreFromTxCount = (n: number) => clamp((Math.log10(n + 1) / Math.log10(301)) * 100);
const scoreFromBalance = (qor: number) => clamp((Math.log10(qor + 1) / Math.log10(11)) * 100);

// Score -> tier thresholds
const tierFromScore = (s: number) => (s >= 80 ? 4 : s >= 60 ? 3 : s >= 35 ? 2 : 1);

export async function POST(req: NextRequest) {
  try {
    const { address } = (await req.json()) as { address?: string };
    if (!address || !isAddress(address)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    const key = process.env.TIER_ORACLE_KEY as Hex | undefined;
    if (!key || !REGISTRY) return NextResponse.json({ error: "Tier oracle not configured (TIER_ORACLE_KEY / NEXT_PUBLIC_TIERS_ADDRESS)" }, { status: 503 });

    let txCount = 0;
    let balanceQor = 0;
    try { txCount = await client.getTransactionCount({ address }); } catch {}
    try { balanceQor = Number(formatEther(await client.getBalance({ address }))); } catch {}

    const txScore = scoreFromTxCount(txCount);
    const balanceScore = scoreFromBalance(balanceQor);
    const creditScore = clamp(txScore * 0.75 + balanceScore * 0.25);
    const tier = tierFromScore(creditScore);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_S);

    // must equal TierRegistry.credentialDigest(trader, tier, expiry)
    const digest = keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint8" }, { type: "uint64" }],
        [CHAIN_ID, REGISTRY, address, tier, expiry]
      )
    );
    const sig = await privateKeyToAccount(key).signMessage({ message: { raw: digest } });

    return NextResponse.json({
      address,
      tier,
      expiry: expiry.toString(),
      sig,
      creditScore,
      scoreBreakdown: { txCount, nativeBalanceQor: Number(balanceQor.toFixed(6)), txScore, balanceScore },
    });
  } catch (e) {
    console.error("[/api/kyc/issue]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
