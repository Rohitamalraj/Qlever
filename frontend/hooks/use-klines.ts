"use client";

import { useEffect, useState } from "react";
import { fetchOhlc, type Candle } from "@/lib/market";
import type { AssetSymbol } from "@/lib/assets";

export function useKlines(symbol: AssetSymbol, timeframe: string) {
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData([]);
    const load = async () => {
      try {
        const rows = await fetchOhlc(symbol, timeframe);
        if (!cancelled) {
          setData(rows);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol, timeframe]);

  return { data, loading, error };
}
