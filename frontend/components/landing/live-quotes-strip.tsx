"use client";

import { useEffect, useState } from "react";
import { TokenLogo } from "@/components/ui/token-logo";

/**
 * Real quotes for the nine underlyings, from the app's Finnhub route (GET /api/stocks/quotes).
 * Shows "—" for anything unavailable. No price is ever hardcoded.
 */

const MARKETS = [
  ["sAAPL", "AAPL"],
  ["sTSLA", "TSLA"],
  ["sNVDA", "NVDA"],
  ["sSPY", "SPY"],
  ["sAMZN", "AMZN"],
  ["sMSFT", "MSFT"],
  ["sMETA", "META"],
  ["sNFLX", "NFLX"],
  ["sAMD", "AMD"],
] as const;

type Quote = { c?: number; dp?: number } | null;

export function LiveQuotesStrip() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/stocks/quotes?symbols=${MARKETS.map((m) => m[1]).join(",")}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Record<string, Quote>;
        if (!alive) return;
        setQuotes(data);
        if (Object.values(data).some((q) => !q || !q.c)) setTimeout(load, 5000); // Finnhub cold cache: retry soon
        setStatus("ok");
      } catch {
        if (alive) setStatus((s) => (s === "ok" ? s : "error"));
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const items = MARKETS.map(([sym, ticker]) => {
    const q = quotes[ticker];
    const price = q && typeof q.c === "number" && q.c > 0 ? q.c : null;
    const dp = price !== null && q && typeof q.dp === "number" && Number.isFinite(q.dp) ? q.dp : null;
    return { sym, price, dp };
  });

  const row = (copy: number) => (
    <div className="flex shrink-0" aria-hidden={copy > 0 || undefined}>
      {items.map((it) => (
        <div key={`${it.sym}-${copy}`} className="flex items-center gap-3 px-6 sm:px-8 py-4 border-r border-foreground/10 font-mono text-sm whitespace-nowrap">
          <TokenLogo ticker={it.sym} size="md" />
          <span className="text-foreground">{it.sym}</span>
          <span className="tabular-nums text-foreground/80">{it.price !== null ? `$${it.price.toFixed(2)}` : "—"}</span>
          <span
            className={`tabular-nums text-xs ${
              it.dp === null ? "text-muted-foreground" : it.dp >= 0 ? "text-green-700" : "text-red-600"
            }`}
          >
            {it.dp === null ? "—" : `${it.dp >= 0 ? "+" : ""}${it.dp.toFixed(2)}%`}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative border-y border-foreground/10 bg-background/70 backdrop-blur-sm">
      <div className="flex items-stretch">
        <div className="shrink-0 flex items-center gap-2 px-4 sm:px-6 border-r border-foreground/10 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === "ok" ? "bg-green-600" : status === "error" ? "bg-foreground/30" : "bg-foreground/30 animate-pulse"
            }`}
          />
          <span className="hidden sm:inline">Underlying quotes · Finnhub</span>
          <span className="sm:hidden">Finnhub</span>
        </div>
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
          <div className="flex w-max marquee motion-reduce:animate-none" style={{ animationDuration: "45s" }}>
            {row(0)}
            {row(1)}
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {status === "error" ? "Quotes unavailable" : ""}
      </span>
    </div>
  );
}
