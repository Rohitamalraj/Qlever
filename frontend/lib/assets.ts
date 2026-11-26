import { hexToString, stringToHex, type Hex } from "viem";

/**
 * The nine markets. UI tickers carry the synthetic "s" prefix (sAAPL); the on-chain asset id is the bare
 * ticker as a left-aligned bytes32. Prices come from Finnhub (real US equity quotes). `cg` is the CoinGecko xStock that
 * tracks the equity; it is used only for chart candles, because Finnhub's candle endpoint is premium-only.
 */
export const ASSETS = [
  { symbol: "sAAPL", ticker: "AAPL", name: "Apple Inc.", cg: "apple-xstock" },
  { symbol: "sTSLA", ticker: "TSLA", name: "Tesla Inc.", cg: "tesla-xstock" },
  { symbol: "sNVDA", ticker: "NVDA", name: "NVIDIA Corp.", cg: "nvidia-xstock" },
  { symbol: "sSPY", ticker: "SPY", name: "S&P 500 ETF", cg: "sp500-xstock" },
  { symbol: "sAMZN", ticker: "AMZN", name: "Amazon.com Inc.", cg: "amazon-xstock" },
  { symbol: "sMSFT", ticker: "MSFT", name: "Microsoft Corp.", cg: "microsoft-xstock" },
  { symbol: "sMETA", ticker: "META", name: "Meta Platforms", cg: "meta-xstock" },
  { symbol: "sNFLX", ticker: "NFLX", name: "Netflix Inc.", cg: "netflix-xstock" },
  { symbol: "sAMD", ticker: "AMD", name: "Advanced Micro Devices", cg: "amd-xstock" },
] as const;

export type AssetSymbol = (typeof ASSETS)[number]["symbol"];
export const ASSET_SYMBOLS = ASSETS.map((a) => a.symbol) as AssetSymbol[];
export const assetName = (s: string) => ASSETS.find((a) => a.symbol === s)?.name ?? s;

/** sAAPL -> bytes32("AAPL") */
export const assetId = (symbol: string): Hex => stringToHex(symbol.replace(/^s/, ""), { size: 32 });
/** bytes32("AAPL") -> sAAPL */
export const symbolOf = (id: Hex): AssetSymbol => `s${hexToString(id, { size: 32 })}` as AssetSymbol;
