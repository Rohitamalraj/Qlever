import React from "react";
import { siApple, siTesla, siNvidia, siMeta, siNetflix, siAmd } from "simple-icons";

export type Mark =
  | { kind: "icon"; path: string; color: string }
  | { kind: "custom"; color: string; node: React.ReactNode };

/** Brand marks for the nine markets. simple-icons has six; Microsoft, Amazon and the S&P 500 are drawn here. */
export const STOCK_MARKS: Record<string, Mark> = {
  AAPL: { kind: "icon", path: siApple.path, color: "#111111" },
  TSLA: { kind: "icon", path: siTesla.path, color: `#${siTesla.hex}` },
  NVDA: { kind: "icon", path: siNvidia.path, color: `#${siNvidia.hex}` },
  MSFT: {
    kind: "custom",
    color: "#00A4EF",
    node: (
      <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden>
        <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
        <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
        <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
        <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
      </svg>
    ),
  },
  AMZN: {
    kind: "custom",
    color: "#FF9900",
    node: (
      <svg viewBox="0 0 48 24" className="w-full h-full" aria-hidden>
        <text x="24" y="13" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="13" fill="#111">amazon</text>
        <path d="M9 16.5 Q24 23 38 16.5" stroke="#FF9900" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M35.5 15.2 L38.6 16.3 L37.2 19.2" stroke="#FF9900" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  META: { kind: "icon", path: siMeta.path, color: `#${siMeta.hex}` },
  NFLX: { kind: "icon", path: siNetflix.path, color: `#${siNetflix.hex}` },
  AMD: { kind: "icon", path: siAmd.path, color: "#111111" },
  SPY: {
    kind: "custom",
    color: "#7C3AED",
    node: (
      <svg viewBox="0 0 40 24" className="w-full h-full" aria-hidden>
        <text x="20" y="11" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="10" fill="#111">S&amp;P</text>
        <text x="20" y="21" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="8" fill="#7C3AED">500</text>
      </svg>
    ),
  },
};

export const STOCK_ORDER = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "META", "NFLX", "AMD", "SPY"] as const;

/** Accepts "AAPL" or the synthetic "sAAPL". */
export const markFor = (ticker: string): Mark | undefined => STOCK_MARKS[ticker.replace(/^s(?=[A-Z])/, "")];

export const glowColor = (m: Mark) => (m.color === "#111111" ? "#6b7280" : m.color);

export function StockMark({ mark }: { mark: Mark }) {
  return mark.kind === "icon" ? (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill={mark.color} aria-hidden>
      <path d={mark.path} />
    </svg>
  ) : (
    <>{mark.node}</>
  );
}
