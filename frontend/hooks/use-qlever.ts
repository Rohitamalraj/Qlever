"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useSignMessage, useWriteContract } from "wagmi";
import { parseEther, type Hex, type PublicClient } from "viem";
import { getEventsSince } from "@/lib/logs";
import { toast } from "sonner";
import type { SealKeyPair } from "@qorechain/qoreseal";
import { ASSET_SYMBOLS, assetId, symbolOf, type AssetSymbol } from "@/lib/assets";
import {
  CONTRACTS, FROM_BLOCK, SEAL_KEY_MESSAGE, feedAbi, tierAbi, vaultAbi, isDeployed, isCrossed,
  openEnvelope, randomNonce, sealKeysFromSignature, sealPosition, toReveal,
  type PositionFields,
} from "@/lib/qlever";

export interface PoolStats { locked: bigint; openCount: bigint; forfeited: bigint }
export interface OraclePrice { price: bigint; publishTime: number }

export type OracleMap = Record<AssetSymbol, OraclePrice | null>;
const emptyOracles = () => Object.fromEntries(ASSET_SYMBOLS.map((a) => [a, null])) as OracleMap;

const errText = (e: unknown) => ((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? "failed").slice(0, 160);

/** Public, position-agnostic chain state: pool solvency and the on-chain oracle price of every market. */
export function useChainState() {
  const client = usePublicClient();
  const [pool, setPool] = useState<PoolStats | null>(null);
  const [oracles, setOracles] = useState<OracleMap>(emptyOracles);

  useEffect(() => {
    if (!client || !isDeployed()) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const [locked, openCount, forfeited] = await client.readContract({ address: CONTRACTS.vault, abi: vaultAbi, functionName: "poolStats" });
        if (!cancelled) setPool({ locked, openCount, forfeited });
      } catch {}
      const next = emptyOracles();
      await Promise.all(ASSET_SYMBOLS.map(async (sym) => {
        try {
          const [price, publishTime] = await client.readContract({ address: CONTRACTS.feed, abi: feedAbi, functionName: "latestPrice", args: [assetId(sym)] });
          next[sym] = { price, publishTime: Number(publishTime) };
        } catch {
          // the adapter reverts when the signed price is stale: leave null, never fall back to a made-up number
        }
      }));
      if (!cancelled) setOracles(next);
    };
    void poll();
    const id = window.setInterval(poll, 10_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [client]);

  return { pool, oracles };
}

export interface TierState {
  tier: number; // effective tier in force (0 = unverified)
  expiry: number; // credential expiry (unix s), 0 if none
  isVerified: boolean;
  leverageCap: number;
  loading: boolean;
}

export interface KycAssessment {
  creditScore: number;
  tier: number;
  expiry: string;
  sig: Hex;
  scoreBreakdown: { txCount: number; nativeBalanceQor: number; txScore: number; balanceScore: number };
}

/** Tier credential flow ("Verify identity"): the tier oracle scores the wallet and signs; the registry verifies on-chain. */
export function useTier() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<TierState>({ tier: 0, expiry: 0, isVerified: false, leverageCap: 2, loading: false });
  const [status, setStatus] = useState<"idle" | "scoring" | "claiming" | "done" | "error">("idle");
  const [assessment, setAssessment] = useState<KycAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client || !address || !CONTRACTS.tiers) return;
    try {
      const [tier, cap, cred] = await Promise.all([
        client.readContract({ address: CONTRACTS.tiers, abi: tierAbi, functionName: "effectiveTier", args: [address] }),
        client.readContract({ address: CONTRACTS.tiers, abi: tierAbi, functionName: "maxLeverage", args: [address] }),
        client.readContract({ address: CONTRACTS.tiers, abi: tierAbi, functionName: "credentialOf", args: [address] }),
      ]);
      const expiry = Number(cred[1]);
      setState({ tier: Number(tier), expiry, isVerified: Number(tier) > 0 && (expiry === 0 || expiry > Date.now() / 1000), leverageCap: Number(cap), loading: false });
    } catch {}
  }, [client, address]);

  useEffect(() => { void refresh(); }, [refresh]);

  const verify = useCallback(async () => {
    if (!client || !address) return;
    setError(null); setAssessment(null);
    try {
      setStatus("scoring");
      const res = await fetch("/api/kyc/issue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "verification service unavailable");
      setAssessment(body as KycAssessment);
      setStatus("claiming");
      const hash = await writeContractAsync({
        address: CONTRACTS.tiers, abi: tierAbi, functionName: "claimTier",
        args: [body.tier, BigInt(body.expiry), body.sig],
      });
      await client.waitForTransactionReceipt({ hash });
      await refresh();
      setStatus("done");
      toast.success(`Verified: tier ${body.tier}. Leverage cap updated on-chain.`);
    } catch (e) {
      setError(errText(e));
      setStatus("error");
    }
  }, [client, address, writeContractAsync, refresh]);

  return { ...state, status, assessment, error, verify, refresh, reset: () => { setStatus("idle"); setError(null); setAssessment(null); } };
}

export function useTierCap() {
  return useTier().leverageCap;
}

export type TxState = "idle" | "signing-keys" | "sealing" | "opening" | "closing";

export type PositionStatus = "open" | "closed" | "liquidated";

export interface TraderPosition {
  id: bigint;
  collateral: bigint;
  commitment: Hex;
  open: boolean;
  status: PositionStatus;
  openedAt: number; // unix s
  returned: bigint | null; // payout when closed by the trader
  fields: PositionFields | null; // null until decrypted client-side
}

/** Realized result in wei: payout minus collateral for a close; the whole collateral for a liquidation. */
export const realizedOf = (p: TraderPosition): bigint | null =>
  p.status === "closed" && p.returned !== null ? p.returned - p.collateral : p.status === "liquidated" ? -p.collateral : null;

/** Trader flow: derive seal keys from a wallet signature, open sealed positions, decrypt own positions, close via reveal. */
export function useTraderPositions() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const [keys, setKeys] = useState<SealKeyPair | null>(null);
  const [positions, setPositions] = useState<TraderPosition[]>([]);
  const [tx, setTx] = useState<TxState>("idle");
  const [closingId, setClosingId] = useState<bigint | null>(null);

  // keys belong to one wallet: drop them when the account changes
  useEffect(() => { setKeys(null); setPositions([]); }, [address]);

  const ensureKeys = useCallback(async () => {
    if (keys) return keys;
    setTx("signing-keys");
    const sig = await signMessageAsync({ message: SEAL_KEY_MESSAGE });
    const k = await sealKeysFromSignature(sig);
    setKeys(k);
    return k;
  }, [keys, signMessageAsync]);

  const refresh = useCallback(async (k: SealKeyPair | null = keys) => {
    if (!client || !address || !isDeployed()) return;
    type L = { args: Record<string, unknown> };
    const pc = client as unknown as PublicClient;
    const [opened, closed, liquidated] = await Promise.all([
      getEventsSince<L>(pc, { address: CONTRACTS.vault, abi: vaultAbi, eventName: "PositionOpened", args: { trader: address } }, FROM_BLOCK),
      getEventsSince<L>(pc, { address: CONTRACTS.vault, abi: vaultAbi, eventName: "PositionClosed" }, FROM_BLOCK),
      getEventsSince<L>(pc, { address: CONTRACTS.vault, abi: vaultAbi, eventName: "PositionLiquidated" }, FROM_BLOCK),
    ]);
    const closedBy = new Map(closed.map((l) => [(l.args as { id: bigint }).id, l.args as { id: bigint; returned: bigint; forfeited: boolean }]));
    const liquidatedIds = new Set(liquidated.map((l) => (l.args as { id: bigint }).id));
    const rows = await Promise.all(opened.map(async (l) => {
      const { id, collateral, commitment, envelope } = l.args as { id: bigint; collateral: bigint; commitment: Hex; envelope: Hex };
      const [, , , openedAt, open] = await client.readContract({ address: CONTRACTS.vault, abi: vaultAbi, functionName: "positions", args: [id] });
      let fields: PositionFields | null = null;
      if (k) { try { fields = openEnvelope(envelope, commitment, k); } catch {} }
      const c = closedBy.get(id);
      const status: PositionStatus = open ? "open" : liquidatedIds.has(id) || c?.forfeited ? "liquidated" : "closed";
      return { id, collateral, commitment, open, status, openedAt: Number(openedAt), returned: c && !c.forfeited ? c.returned : null, fields } satisfies TraderPosition;
    }));
    setPositions(rows.sort((x, y) => Number(y.id - x.id)));
  }, [client, address, keys]);

  useEffect(() => { void refresh(); const t = window.setInterval(() => void refresh(), 15_000); return () => window.clearInterval(t); }, [refresh]);

  /** Reveal (decrypt) own positions locally. */
  const unlock = useCallback(async () => {
    try { const k = await ensureKeys(); await refresh(k); } catch (e) { toast.error(errText(e)); }
    finally { setTx("idle"); }
  }, [ensureKeys, refresh]);

  /** Opens a sealed position on `asset`. The entry price is the on-chain oracle price right now, sealed with the rest. */
  const open = useCallback(async (p: { asset: AssetSymbol; collateral: string; leverage: number; isLong: boolean; liqPrice: bigint }) => {
    if (!client || !address) return false;
    try {
      const k = await ensureKeys();
      setTx("sealing");
      const [entryPrice] = await client.readContract({ address: CONTRACTS.feed, abi: feedAbi, functionName: "latestPrice", args: [assetId(p.asset)] })
        .catch(() => { throw new Error(`No fresh on-chain price for ${p.asset} yet. Try again in a minute.`); });
      const fields: PositionFields = { asset: assetId(p.asset), entryPrice, leverage: p.leverage, isLong: p.isLong, liqPrice: p.liqPrice, nonce: randomNonce() };
      const { commitment, envelope } = await sealPosition(fields, k, CONTRACTS.keeper);
      setTx("opening");
      const hash = await writeContractAsync({
        address: CONTRACTS.vault, abi: vaultAbi, functionName: "openPosition",
        args: [commitment, envelope], value: parseEther(p.collateral),
      });
      await client.waitForTransactionReceipt({ hash });
      toast.success("Position opened. On-chain: commitment hash only.");
      await refresh(k);
      return true;
    } catch (e) {
      toast.error(errText(e));
      return false;
    } finally { setTx("idle"); }
  }, [client, address, ensureKeys, writeContractAsync, refresh]);

  const close = useCallback(async (pos: TraderPosition) => {
    if (!client || !pos.fields) return;
    try {
      setTx("closing"); setClosingId(pos.id);
      const hash = await writeContractAsync({
        address: CONTRACTS.vault, abi: vaultAbi, functionName: "closePosition",
        args: [pos.id, toReveal(pos.fields)],
      });
      const rcpt = await client.waitForTransactionReceipt({ hash });
      if (rcpt.status !== "success") throw new Error("close reverted");
      toast.success("Position closed: reveal verified against the commitment.");
      await refresh();
    } catch (e) {
      toast.error(errText(e));
    } finally { setTx("idle"); setClosingId(null); }
  }, [client, writeContractAsync, refresh]);

  return { keys, positions, tx, closingId, unlock, open, close, refresh };
}

function isCrossedNow(f: PositionFields, oracles: OracleMap): boolean {
  const o = oracles[symbolOf(f.asset)];
  return !!o && isCrossed(f.isLong, f.liqPrice, o.price);
}

export interface KeeperPosition {
  id: bigint;
  trader: Hex;
  collateral: bigint;
  commitment: Hex;
  open: boolean;
  fields: PositionFields | null;
}

/** Keeper flow: decrypt every envelope addressed to it, compare with the oracle, liquidate with reveal-and-verify. */
export function useKeeperPositions(keys: SealKeyPair | null, oracles: OracleMap) {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [positions, setPositions] = useState<KeeperPosition[]>([]);
  const [busy, setBusy] = useState<bigint | null>(null);

  const refresh = useCallback(async () => {
    if (!client || !isDeployed()) return;
    const logs = await getEventsSince<{ args: Record<string, unknown> }>(client as unknown as PublicClient, { address: CONTRACTS.vault, abi: vaultAbi, eventName: "PositionOpened" }, FROM_BLOCK);
    const rows = await Promise.all(logs.map(async (l) => {
      const { id, trader, collateral, commitment, envelope } = l.args as { id: bigint; trader: Hex; collateral: bigint; commitment: Hex; envelope: Hex };
      const [, , , , open] = await client.readContract({ address: CONTRACTS.vault, abi: vaultAbi, functionName: "positions", args: [id] });
      let fields: PositionFields | null = null;
      if (keys) { try { fields = openEnvelope(envelope, commitment, keys); } catch {} }
      return { id, trader, collateral, commitment, open, fields } satisfies KeeperPosition;
    }));
    setPositions(rows.sort((x, y) => Number(y.id - x.id)));
  }, [client, keys]);

  useEffect(() => { void refresh(); const t = window.setInterval(() => void refresh(), 10_000); return () => window.clearInterval(t); }, [refresh]);

  const liquidatable = useCallback((p: KeeperPosition) =>
    !!p.fields && p.open && isCrossedNow(p.fields, oracles), [oracles]);

  const liquidate = useCallback(async (p: KeeperPosition) => {
    if (!client || !p.fields) return;
    try {
      setBusy(p.id);
      const hash = await writeContractAsync({ address: CONTRACTS.vault, abi: vaultAbi, functionName: "liquidate", args: [p.id, toReveal(p.fields)] });
      const rcpt = await client.waitForTransactionReceipt({ hash });
      if (rcpt.status !== "success") throw new Error("liquidate reverted");
      toast.success(`Position #${p.id} liquidated: hash-verified reveal.`);
      await refresh();
    } catch (e) {
      toast.error(errText(e));
    } finally { setBusy(null); }
  }, [client, writeContractAsync, refresh]);

  /** Demo step 2: submit made-up numbers. The vault must reject them because the hash will not match. */
  const attemptFabricated = useCallback(async (p: KeeperPosition) => {
    if (!client || !address) return;
    const base = p.fields ?? { asset: assetId("sAAPL"), entryPrice: 1n, leverage: 1, isLong: true, liqPrice: 1n, nonce: randomNonce() };
    const fake = { ...toReveal(base), leverage: 99, isLong: !base.isLong, liqPrice: 1n, nonce: randomNonce() };
    try {
      await client.simulateContract({
        account: address, // must be the Keeper wallet so the revert is the hash check, not the access check
        address: CONTRACTS.vault, abi: vaultAbi, functionName: "liquidate", args: [p.id, fake],
      });
      toast.error("Unexpected: fabricated liquidation did not revert");
    } catch (e) {
      toast.success(`Fabricated liquidation rejected on-chain: ${errText(e).slice(0, 120)}`);
    }
  }, [client, address]);

  return { positions, busy, liquidatable, liquidate, attemptFabricated, refresh };
}

export const useDeployed = () => useMemo(() => isDeployed(), []);
