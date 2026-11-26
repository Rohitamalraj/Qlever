import { stringToHex, type Hex } from "viem";

/** The nine markets. `symbol` is the Finnhub ticker and the on-chain asset id. */
export const ASSETS = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "TSLA", name: "Tesla Inc." },
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "SPY", name: "S&P 500 ETF" },
  { symbol: "AMZN", name: "Amazon.com Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "NFLX", name: "Netflix Inc." },
  { symbol: "AMD", name: "Advanced Micro Devices" },
] as const;

export type AssetSymbol = (typeof ASSETS)[number]["symbol"];

/** On-chain asset id: the ticker as left-aligned bytes32 (matches bytes32("AAPL") in Solidity). */
export const assetId = (symbol: string): Hex => stringToHex(symbol, { size: 32 });
export const symbolOf = (id: Hex): string => {
  const hex = id.slice(2).replace(/(00)+$/, "");
  return Buffer.from(hex, "hex").toString("utf8");
};
