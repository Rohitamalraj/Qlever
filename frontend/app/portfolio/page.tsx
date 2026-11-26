"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useBalance } from "wagmi";
import { formatEther } from "viem";
import { Loader2 } from "lucide-react";
import { AppNav } from "@/components/app/app-nav";
import { TokenLogo } from "@/components/ui/token-logo";
import { useAssetQuotes } from "@/hooks/use-asset-quotes";
import { useChainState, useTier, useTraderPositions } from "@/hooks/use-qlever";
import { ASSETS, type AssetSymbol } from "@/lib/assets";
import { fromE8 } from "@/lib/qlever";
import { enrich, fmtPrice, fmtQor } from "@/lib/position-math";

const sealed = <span className="font-mono text-xs text-muted-foreground">Sealed</span>;

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const trader = useTraderPositions();
  const prices = useAssetQuotes();
  const { pool, oracles } = useChainState();
  const tier = useTier();

  const marks = useMemo(() => {
    const m: Partial<Record<AssetSymbol, number>> = {};
    for (const a of ASSETS) {
      const o = oracles[a.symbol];
      const v = o ? fromE8(o.price) : prices[a.symbol].price;
      if (v > 0) m[a.symbol] = v;
    }
    return m;
  }, [oracles, prices]);

  const rows = useMemo(() => trader.positions.map((p) => ({ raw: p, e: enrich(p, marks) })), [trader.positions, marks]);
  const open = rows.filter((r) => r.e.status === "open");
  const history = rows.filter((r) => r.e.status !== "open");

  const openPnl = open.reduce((s, r) => s + (r.e.pnl ?? 0), 0);
  const realizedPnl = history.reduce((s, r) => s + (r.e.realized ?? 0), 0);
  const openEquity = open.reduce((s, r) => s + r.e.collateral + (r.e.pnl ?? 0), 0);
  const balance = bal ? Number(bal.formatted) : 0;
  const totalValue = balance + openEquity;
  const hasSealed = rows.some((r) => !r.e.decrypted);
  const signed = (v: number) => `${v >= 0 ? "+" : ""}${fmtQor(v)}`;
  const tone = (v: number) => (v >= 0 ? "text-green-700" : "text-red-600");

  if (!isConnected) {
    return (
      <>
        <AppNav />
        <div className="min-h-screen bg-background flex items-center justify-center pt-16">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-mono">Connect Wallet</h1>
            <p className="text-muted-foreground font-mono text-sm">Connect your wallet to view your portfolio</p>
            <Link href="/trade" className="inline-block px-4 py-2 bg-foreground text-background font-mono text-xs border border-foreground hover:bg-foreground/90 transition-colors">Go to Trade</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-16">
      <AppNav />

      <div className="border-b border-foreground/10 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono mb-1">Portfolio</h1>
            <p className="text-xs font-mono text-muted-foreground">
              {address?.slice(0, 6)}...{address?.slice(-4)}
              {tier.isVerified && <span> · T{tier.tier} · up to {tier.leverageCap}x</span>}
            </p>
          </div>
          <Link href="/trade" className="px-4 py-2 bg-foreground text-background font-mono text-xs border border-foreground hover:bg-foreground/90 transition-colors">Trade</Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          {[
            ["Total Value", `${fmtQor(totalValue)} QOR`, ""],
            ["Open P&L", `${signed(openPnl)} QOR`, tone(openPnl)],
            ["Realized P&L", `${signed(realizedPnl)} QOR`, tone(realizedPnl)],
            ["Open Positions", String(open.length), ""],
            ["QOR Balance", `${fmtQor(balance)} QOR`, ""],
          ].map(([k, v, c]) => (
            <div key={k} className="border border-foreground/10 p-4">
              <div className="text-xs font-mono text-muted-foreground mb-1">{k}</div>
              <div className={`text-2xl font-mono ${c}`}>{v}</div>
            </div>
          ))}
        </div>
        {hasSealed && (
          <p className="text-[10px] font-mono text-muted-foreground mb-6">
            ⚠ Some positions are still sealed. Totals above only include positions you have decrypted.{" "}
            {!trader.keys && <button onClick={trader.unlock} className="underline hover:text-foreground">Decrypt my positions</button>}
          </p>
        )}

        <div className="border border-foreground/10 p-4 mb-8 bg-foreground/[0.02]">
          <h2 className="text-sm font-mono mb-1">How positions settle</h2>
          <p className="text-xs font-mono text-muted-foreground leading-relaxed">
            Closing reveals your sealed fields; the vault verifies them against your on-chain commitment, then returns collateral plus or minus PnL.
            Losses are capped at your collateral. Profits are paid only from the forfeited-collateral pool
            ({pool ? `${Number(formatEther(pool.forfeited)).toLocaleString(undefined, { maximumFractionDigits: 4 })} QOR available now` : "pool unavailable"}),
            so a profit can be partly paid when the pool is small. Your sealed entry price is checked against the price range the oracle recorded when you opened.
          </p>
        </div>

        <div className="border-b border-foreground/10 mb-6">
          <div className="flex gap-8">
            {([["positions", `Open Positions${open.length > 0 ? ` (${open.length})` : ""}`], ["history", "Trade History"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} className={`pb-3 font-mono text-sm transition-colors ${tab === key ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "positions" ? (
          <div className="border border-foreground/10 overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-8 gap-4 p-4 border-b border-foreground/10 bg-foreground/[0.02]">
                {["Asset", "Direction", "Collateral", "Entry", "Mark", "Liq. Price", "P&L", "Action"].map((h) => (
                  <div key={h} className="text-[10px] font-mono text-muted-foreground uppercase">{h}</div>
                ))}
              </div>
              {open.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-muted-foreground font-mono text-sm mb-4">No open positions</div>
                  <Link href="/trade" className="inline-block px-4 py-2 bg-foreground text-background font-mono text-xs border border-foreground hover:bg-foreground/90 transition-colors">Start Trading</Link>
                </div>
              ) : (
                open.map(({ raw, e }) => (
                  <div key={e.id.toString()} className="grid grid-cols-8 gap-4 p-4 border-b border-foreground/10 hover:bg-foreground/[0.02] items-center">
                    <div className="flex items-center gap-2"><TokenLogo ticker={e.asset ?? "s?"} size="sm" /><span className="font-mono text-xs">#{e.id.toString()} {e.ticker ?? "Sealed"}</span></div>
                    <div>
                      {e.direction === "SEALED" ? <span className="font-mono text-xs px-2 py-0.5 bg-foreground/10 text-muted-foreground">Sealed</span> : (
                        <span className={`font-mono text-xs px-2 py-0.5 ${e.direction === "LONG" ? "bg-green-700/10 text-green-700" : "bg-red-600/10 text-red-600"}`}>{e.direction} {e.leverage}x</span>
                      )}
                    </div>
                    <div className="font-mono text-xs">{fmtQor(e.collateral)} QOR</div>
                    <div className="font-mono text-xs">{e.entry === null ? sealed : `$${fmtPrice(e.entry)}`}</div>
                    <div className="font-mono text-xs">{e.mark === null ? "—" : `$${fmtPrice(e.mark)}`}</div>
                    <div className="font-mono text-xs text-red-600">{e.liq === null ? sealed : `$${fmtPrice(e.liq)}`}</div>
                    <div className={`font-mono text-xs ${e.pnl === null ? "text-muted-foreground" : tone(e.pnl)}`}>
                      {e.pnl === null ? "Sealed" : <>{signed(e.pnl)} QOR<div className="text-[10px] opacity-70">{e.pnlPct !== null && `${e.pnlPct >= 0 ? "+" : ""}${e.pnlPct.toFixed(2)}%`}</div></>}
                    </div>
                    <div>
                      <button onClick={() => trader.close(raw)} disabled={!raw.fields || trader.closingId !== null} className="px-3 py-1 font-mono text-[10px] bg-red-600/10 text-red-600 hover:bg-red-600/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {trader.closingId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Close"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="border border-foreground/10 overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-6 gap-4 p-4 border-b border-foreground/10 bg-foreground/[0.02]">
                {["Date", "Asset", "Direction", "Collateral", "Result", "Status"].map((h) => (
                  <div key={h} className="text-[10px] font-mono text-muted-foreground uppercase">{h}</div>
                ))}
              </div>
              {history.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground font-mono text-sm">No closed trades yet</div>
              ) : (
                history.map(({ e }) => (
                  <div key={e.id.toString()} className="grid grid-cols-6 gap-4 p-4 border-b border-foreground/10 font-mono text-xs items-center">
                    <div className="text-muted-foreground">{e.openedAt ? new Date(e.openedAt * 1000).toLocaleDateString() : "—"}</div>
                    <div>#{e.id.toString()} {e.ticker ?? "Sealed"}</div>
                    <div>{e.direction === "SEALED" ? "Sealed" : `${e.direction} ${e.leverage}x`}</div>
                    <div>{fmtQor(e.collateral)} QOR</div>
                    <div className={e.realized === null ? "text-muted-foreground" : tone(e.realized)}>{e.realized === null ? "—" : `${signed(e.realized)} QOR`}</div>
                    <div className={e.status === "liquidated" ? "text-red-600" : "text-muted-foreground"}>{e.status === "liquidated" ? "LIQUIDATED" : "CLOSED"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
