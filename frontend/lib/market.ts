// Real market data only. Quotes: Finnhub (real US equity prices) through our /api/stocks/quotes route, so the API key stays
// server-side. Candles: CoinGecko xStock OHLC (Finnhub's candle API is premium-only). Settlement uses the on-chain oracle.
import type { AssetSymbol } from "@/lib/assets";

/** Finnhub /quote payload, passed through our /api/stocks/quotes route. */
export type FinnhubQuoteRaw = { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; t?: number } | null;

export async function fetchQuotes(tickers: string[]): Promise<Record<string, FinnhubQuoteRaw>> {
  const r = await fetch(`/api/stocks/quotes?symbols=${tickers.join(",")}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`quotes ${r.status}`);
  return r.json();
}

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }

/** UI timeframe -> CoinGecko OHLC range. CoinGecko picks the candle size: 1d = 30m, 7-30d = 4h, 90d+ = 4d. */
export const TIMEFRAMES = ["1D", "7D", "30D", "1Y"] as const;

export async function fetchOhlc(symbol: AssetSymbol, timeframe: string): Promise<Candle[]> {
  const r = await fetch(`/api/ohlc?symbol=${symbol}&tf=${timeframe}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`ohlc ${r.status}`);
  const rows = (await r.json()) as { candles: number[][] };
  return rows.candles.map((k) => ({ time: Math.floor(k[0] / 1000), open: k[1], high: k[2], low: k[3], close: k[4], volume: 0 }));
}
