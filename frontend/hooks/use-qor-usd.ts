"use client";

import { useEffect, useState } from "react";

let shared: number | null = null;

/** Live QOR/USD (CoinGecko, mainnet QOR). null until loaded or if unavailable. */
export function useQorUsd() {
  const [usd, setUsd] = useState<number | null>(shared);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/qor-price").then((r) => r.json()).then((d) => {
        if (alive && d.usd > 0) { shared = d.usd; setUsd(d.usd); }
      }).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return usd;
}

/** "$1,234.56" / "$0.0512" / "" when no price. */
export function fmtUsd(qor: number, usd: number | null): string {
  if (usd === null || !Number.isFinite(qor)) return "";
  const v = qor * usd;
  const a = Math.abs(v);
  const d = a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
