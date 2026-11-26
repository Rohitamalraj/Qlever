import { formatEther } from "viem";
import { symbolOf, type AssetSymbol } from "@/lib/assets";
import { fromE8 } from "@/lib/qlever";
import { realizedOf, type TraderPosition } from "@/hooks/use-qlever";

export interface EnrichedPosition {
  id: bigint;
  status: TraderPosition["status"];
  openedAt: number;
  collateral: number; // QOR
  commitment: string;
  decrypted: boolean;
  asset: AssetSymbol | null;
  ticker: string | null; // AAPL
  direction: "LONG" | "SHORT" | "SEALED";
  leverage: number | null;
  size: number | null; // QOR notional = collateral * leverage
  entry: number | null; // USD
  mark: number | null; // USD (on-chain oracle when fresh, else the live quote)
  liq: number | null; // USD
  pnl: number | null; // QOR, unrealized for open positions
  pnlPct: number | null;
  realized: number | null; // QOR, for closed/liquidated positions
}

const qor = (v: bigint) => Number(formatEther(v));

/**
 * Derived display numbers. PnL mirrors the vault: collateral * leverage * move. The vault pays profits only from the
 * forfeited pool and caps losses at the collateral, so the on-screen figure is the uncapped theoretical PnL.
 */
export function enrich(p: TraderPosition, marks: Partial<Record<AssetSymbol, number>>): EnrichedPosition {
  const f = p.fields;
  const asset = f ? symbolOf(f.asset) : null;
  const collateral = qor(p.collateral);
  const entry = f ? fromE8(f.entryPrice) : null;
  const mark = asset && marks[asset] ? (marks[asset] as number) : null;
  const size = f ? collateral * f.leverage : null;
  let pnl: number | null = null;
  let pnlPct: number | null = null;
  if (f && entry && entry > 0 && mark && p.status === "open") {
    const move = (f.isLong ? mark - entry : entry - mark) / entry;
    pnl = Math.max(-collateral, collateral * f.leverage * move);
    pnlPct = (pnl / collateral) * 100;
  }
  const realizedWei = realizedOf(p);
  return {
    id: p.id,
    status: p.status,
    openedAt: p.openedAt,
    collateral,
    commitment: p.commitment,
    decrypted: !!f,
    asset,
    ticker: asset ? asset.slice(1) : null,
    direction: f ? (f.isLong ? "LONG" : "SHORT") : "SEALED",
    leverage: f ? f.leverage : null,
    size,
    entry,
    mark,
    liq: f ? fromE8(f.liqPrice) : null,
    pnl,
    pnlPct,
    realized: realizedWei === null ? null : qor(realizedWei),
  };
}

export const fmtPrice = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(2) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toFixed(4));
export const fmtQor = (v: number) => {
  const a = Math.abs(v);
  return a === 0 ? "0.00" : a < 0.01 ? v.toFixed(4) : a < 0.1 ? v.toFixed(3) : v.toFixed(2);
};
