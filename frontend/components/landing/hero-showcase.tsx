"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, ShieldCheck, TrendingUp, TrendingDown } from "lucide-react";
import { TokenLogo } from "@/components/ui/token-logo";

const PICKS = [
  { sym: "sNVDA", ticker: "NVDA", name: "NVIDIA" },
  { sym: "sAAPL", ticker: "AAPL", name: "Apple" },
  { sym: "sTSLA", ticker: "TSLA", name: "Tesla" },
] as const;
const LEV = 3;

type Quote = { c?: number; dp?: number } | null;

/** Hero card: real 1-day price line (CoinGecko xStock OHLC) + live Finnhub quote, with an example 3x position's PnL. */
export function HeroShowcase() {
  const [i, setI] = useState(0);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const pick = PICKS[i];

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % PICKS.length), 5000);
    const loadQuotes = () =>
      fetch(`/api/stocks/quotes?symbols=${PICKS.map((p) => p.ticker).join(",")}`).then((r) => r.json()).then((d) => {
        setQuotes(d);
        if (PICKS.some((p) => !d?.[p.ticker]?.c)) setTimeout(loadQuotes, 5000);
      }).catch(() => setTimeout(loadQuotes, 5000));
    loadQuotes();
    const qt = setInterval(loadQuotes, 60_000);
    PICKS.forEach((p) =>
      fetch(`/api/ohlc?symbol=${p.sym}&tf=1D`).then((r) => r.json()).then((d) => {
        if (Array.isArray(d.candles)) setSeries((s) => ({ ...s, [p.sym]: d.candles.map((c: number[]) => c[4]) }));
      }).catch(() => {})
    );
    return () => { clearInterval(t); clearInterval(qt); };
  }, []);

  const pts = series[pick.sym] ?? [];
  const { line, area, pnl } = useMemo(() => {
    if (pts.length < 2) return { line: "", area: "", pnl: null as number | null };
    const min = Math.min(...pts), max = Math.max(...pts), W = 400, H = 150;
    const xy = pts.map((v, k) => [(k / (pts.length - 1)) * W, H - ((v - min) / (max - min || 1)) * (H - 16) - 8]);
    const l = xy.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return { line: l, area: `${l} L${W},${H} L0,${H} Z`, pnl: ((pts[pts.length - 1] - pts[0]) / pts[0]) * LEV * 100 };
  }, [pts]);

  const q = quotes[pick.ticker];
  const up = (pnl ?? 0) >= 0;
  const color = up ? "#15803d" : "#dc2626";

  return (
    <div
      ref={ref}
      className="relative h-full flex items-start justify-center pt-2 [perspective:1200px]"
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -8, y: ((e.clientX - r.left) / r.width - 0.5) * 10 });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div aria-hidden className="absolute w-[70%] h-[60%] rounded-full blur-3xl opacity-30 transition-colors duration-700" style={{ background: color }} />

      {/* back card: what the chain sees */}
      <div
        className="absolute w-[78%] max-w-[420px] rounded-2xl border border-foreground/10 bg-background/70 backdrop-blur p-4 font-mono text-[11px] text-muted-foreground shadow-xl"
        style={{ transform: `translate(16%, -8%) rotate(4deg) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: "transform .2s" }}
      >
        <div className="flex items-center gap-2 mb-2"><Lock className="w-3 h-3" />What everyone else sees</div>
        <div className="truncate">A locked hash: 0x7f3a…c91e</div>
        <div>Nothing about your trade</div>
      </div>

      {/* main card */}
      <div
        className="relative w-[96%] max-w-[560px] rounded-2xl border border-foreground/10 bg-background shadow-2xl p-5"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: "transform .2s" }}
      >
        <div className="flex items-center gap-2 mb-4">
          {PICKS.map((p, k) => (
            <button key={p.sym} onClick={() => setI(k)}
              className={`flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full border text-sm font-mono transition-all ${k === i ? "border-foreground/40 bg-foreground/5 scale-105" : "border-foreground/10 opacity-60 hover:opacity-100"}`}>
              <TokenLogo ticker={p.sym} size="lg" className="!w-10 !h-10" />{p.ticker}
            </button>
          ))}
        </div>

        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3"><TokenLogo ticker={pick.sym} size="lg" className="!w-12 !h-12 shadow-md" /><div><div className="font-mono text-[10px] text-muted-foreground">{pick.name} · live</div>
            <div className="text-3xl font-display">{q?.c ? `$${q.c.toFixed(2)}` : "—"}</div></div></div>
          </div>
          {q?.dp != null && (
            <div className={`font-mono text-sm ${q.dp >= 0 ? "text-green-700" : "text-red-600"}`}>{q.dp >= 0 ? "+" : ""}{q.dp.toFixed(2)}% today</div>
          )}
        </div>

        <svg key={pick.sym} viewBox="0 0 400 150" className="w-full h-44 mt-3" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hs-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity=".25" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {area && <path d={area} fill="url(#hs-fill)" className="animate-[fadein_1.2s_ease]" />}
          {line && <path d={line} fill="none" stroke={color} strokeWidth="2" pathLength={1} strokeDasharray="1" strokeDashoffset="1" className="animate-[draw_1.6s_ease_forwards]" />}
        </svg>

        <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
          <div className="rounded-lg bg-foreground/[0.03] p-2"><div className="text-muted-foreground">Position</div><div>Long {LEV}x</div></div>
          <div className="rounded-lg bg-foreground/[0.03] p-2"><div className="text-muted-foreground">P&amp;L (24h)</div>
            <div className={`flex items-center gap-1 ${up ? "text-green-700" : "text-red-600"}`}>{pnl == null ? "—" : <>{up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{up ? "+" : ""}{pnl.toFixed(2)}%</>}</div></div>
          <div className="rounded-lg bg-foreground/[0.03] p-2"><div className="text-muted-foreground">Visible to</div><div className="flex items-center gap-1"><Lock className="w-3 h-3" />You + Keeper</div></div>
        </div>
        <div className="mt-3 font-mono text-[9px] text-muted-foreground">Example: 3x long over the last 24 hours, real prices</div>
      </div>

      {/* floating badge */}
      <div className="absolute bottom-[8%] left-[2%] flex items-center gap-2 rounded-full border border-green-700/30 bg-background px-3 py-1.5 font-mono text-[11px] text-green-700 shadow-lg motion-safe:animate-bounce [animation-duration:3s]">
        <ShieldCheck className="w-3.5 h-3.5" />Encrypted end to end
      </div>
    </div>
  );
}
