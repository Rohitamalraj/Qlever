"use client";

import { useEffect, useRef, useState } from "react";
import { fetchQuotes } from "@/lib/market";
import { ASSETS, ASSET_SYMBOLS, type AssetSymbol } from "@/lib/assets";

export type { AssetSymbol } from "@/lib/assets";
export { ASSET_SYMBOLS } from "@/lib/assets";

export interface PriceData {
  price: number;
  change24h: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  open: number;
  volume24h: number; // Finnhub's quote endpoint has no volume; 0 means unavailable
  updatedAt: number; // unix seconds of the last trade Finnhub saw
}

const empty: PriceData = { price: 0, change24h: 0, changePercent: 0, high24h: 0, low24h: 0, open: 0, volume24h: 0, updatedAt: 0 };
const initial = () => Object.fromEntries(ASSET_SYMBOLS.map((s) => [s, empty])) as Record<AssetSymbol, PriceData>;

/** Live US-equity quotes from Finnhub. For display; settlement uses the on-chain oracle. */
export function useAssetQuotes() {
  const [prices, setPrices] = useState<Record<AssetSymbol, PriceData>>(initial);
  const warned = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const payload = await fetchQuotes(ASSETS.map((a) => a.ticker));
        if (cancelled) return;
        setPrices((prev) => {
          const next = { ...prev };
          for (const a of ASSETS) {
            const q = payload?.[a.ticker];
            if (!q || typeof q.c !== "number" || !(q.c > 0)) continue; // keep the last real quote, never invent one
            const prevClose = typeof q.pc === "number" && q.pc > 0 ? q.pc : undefined;
            const change24h = typeof q.d === "number" ? q.d : prevClose ? q.c - prevClose : 0;
            const changePercent = typeof q.dp === "number" ? q.dp : prevClose ? (change24h / prevClose) * 100 : 0;
            next[a.symbol] = {
              price: q.c, change24h, changePercent,
              high24h: q.h ?? q.c, low24h: q.l ?? q.c, open: q.o ?? q.c, volume24h: 0, updatedAt: q.t ?? 0,
            };
          }
          return next;
        });
        warned.current = false;
      } catch (e) {
        if (!warned.current) { console.warn("[Qlever:prices] quote fetch failed", e); warned.current = true; }
      }
    };
    void poll();
    const id = window.setInterval(poll, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return prices;
}
