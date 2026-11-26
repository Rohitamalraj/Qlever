"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAccount, useBalance } from "wagmi";
import { AppNav } from "@/components/app/app-nav";
import { TradingLayout } from "@/components/dashboard/trading-layout";
import { MarketsPanel } from "@/components/dashboard/markets-panel";
import { CandlestickChart } from "@/components/dashboard/candlestick-chart";
import { TradeForm, type TradeParams } from "@/components/dashboard/trade-form";
import { StatsBar } from "@/components/dashboard/stats-bar";
import { PositionsPanel } from "@/components/dashboard/positions-panel";
import { useAssetQuotes } from "@/hooks/use-asset-quotes";
import { useChainState, useTier, useTraderPositions } from "@/hooks/use-qlever";
import { ASSETS, type AssetSymbol } from "@/lib/assets";
import { isDeployed, toE8, fromE8 } from "@/lib/qlever";
import { isUsEquityMarketOpen } from "@/lib/market-hours";

const VerifyIdentityModal = dynamic(
  () => import("@/components/dashboard/verify-identity-modal").then((m) => m.VerifyIdentityModal),
  { ssr: false }
);

export default function TradePage() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const [ticker, setTicker] = useState<AssetSymbol>("sAAPL");
  const [timeframe, setTimeframe] = useState("1D");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [verifyOpen, setVerifyOpen] = useState(false);

  const prices = useAssetQuotes();
  const { pool, oracles } = useChainState();
  const tier = useTier();
  const trader = useTraderPositions();
  const data = prices[ticker];
  const oracle = oracles[ticker];
  const marketOpen = isUsEquityMarketOpen();

  const markets = ASSETS.map((a) => ({
    ticker: a.symbol,
    name: a.name,
    price: prices[a.symbol].price,
    change24h: prices[a.symbol].changePercent,
    leverage: tier.leverageCap,
    isFavorite: favorites.has(a.symbol),
  }));

  // mark = the on-chain oracle price (what settlement uses) when fresh, else the live quote
  const marks = useMemo(() => {
    const m: Partial<Record<AssetSymbol, number>> = {};
    for (const a of ASSETS) {
      const o = oracles[a.symbol];
      const v = o ? fromE8(o.price) : prices[a.symbol].price;
      if (v > 0) m[a.symbol] = v;
    }
    return m;
  }, [oracles, prices]);

  const toggleFavorite = useCallback((t: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const handleTrade = useCallback(
    (p: TradeParams) =>
      trader.open({ asset: ticker, collateral: p.collateral, leverage: Math.round(p.leverage), isLong: p.isLong, liqPrice: toE8(p.liqPrice) }),
    [trader, ticker]
  );

  const selected = markets.find((m) => m.ticker === ticker)!;

  return (
    <div className="min-h-screen bg-background pt-16">
      <AppNav />
      <StatsBar
        selectedMarket={selected}
        markets={markets}
        onMarketChange={(m) => setTicker(m.ticker as AssetSymbol)}
        marketOpen={marketOpen}
        data={data}
        oracle={oracle}
        pool={pool}
      />
      <TradingLayout
        leftPanel={<MarketsPanel markets={markets} selectedMarket={ticker} onSelectMarket={(t) => setTicker(t as AssetSymbol)} onToggleFavorite={toggleFavorite} />}
        centerPanel={<CandlestickChart ticker={ticker} selectedTimeframe={timeframe} onTimeframeChange={setTimeframe} marketOpen={marketOpen} />}
        rightPanel={
          <TradeForm
            key={ticker}
            ticker={ticker}
            currentPrice={data.price}
            maxLeverage={tier.leverageCap}
            isConnected={isConnected}
            isDeployed={isDeployed()}
            balance={bal ? Number(bal.formatted).toFixed(3) : undefined}
            txStatus={trader.tx}
            onTrade={handleTrade}
            isVerified={tier.isVerified}
            onVerifyClick={() => setVerifyOpen(true)}
          />
        }
        bottomPanel={
          <PositionsPanel
            positions={trader.positions}
            marks={marks}
            unlocked={!!trader.keys}
            onUnlock={trader.unlock}
            onClosePosition={trader.close}
            closingId={trader.closingId}
            isConnected={isConnected}
          />
        }
      />
      {verifyOpen && <VerifyIdentityModal open={verifyOpen} onOpenChange={setVerifyOpen} />}
    </div>
  );
}
