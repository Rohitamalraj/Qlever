"use client"

import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatEther } from 'viem'
import { useQorUsd, fmtUsd } from '@/hooks/use-qor-usd'
import { TokenLogo } from '@/components/ui/token-logo'
import type { PriceData } from '@/hooks/use-asset-quotes'
import type { OraclePrice, PoolStats } from '@/hooks/use-qlever'
import { fromE8 } from '@/lib/qlever'

interface Market {
  ticker: string
  name: string
  price: number
  change24h: number
}

interface StatsBarProps {
  selectedMarket: Market
  markets: Market[]
  onMarketChange: (market: Market) => void
  marketOpen: boolean
  data: PriceData
  oracle: OraclePrice | null
  pool: PoolStats | null
}

const usd = (n: number | null, decimals = 2) => {
  if (n === null || !Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: decimals })}`
}
const qor = (v: bigint | undefined) => (v === undefined ? '—' : `${Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 4 })} QOR`)

function Stat({ label, value, tone, title }: { label: string; value: string; tone?: string; title?: string }) {
  return (
    <div className="flex flex-col flex-shrink-0" title={title}>
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className={`font-mono text-xs ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

export function StatsBar({ selectedMarket, markets, onMarketChange, marketOpen, data, oracle, pool }: StatsBarProps) {
  const qorUsd = useQorUsd()
  const withUsd = (v: bigint | undefined) => (v === undefined ? '—' : `${qor(v)}${qorUsd !== null ? ` (${fmtUsd(Number(formatEther(v)), qorUsd)})` : ''}`)
  const [open, setOpen] = useState(false)
  const ticker = selectedMarket.ticker
  const age = oracle ? Math.max(0, Math.floor(Date.now() / 1000) - oracle.publishTime) : null

  return (
    <div className="w-full bg-background border-b border-foreground/10 relative z-20">
      <div className="max-w-[1920px] mx-auto px-6 py-3">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
          {/* Market selector */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 hover:opacity-80">
              <TokenLogo ticker={ticker} size="md" />
              <span className="font-mono text-lg font-semibold">{ticker.slice(1)}/USD</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
            {open && (
              <div className="absolute left-0 top-full mt-2 w-64 bg-background border border-foreground/10 shadow-lg max-h-80 overflow-y-auto">
                {markets.map((m) => (
                  <button
                    key={m.ticker}
                    onClick={() => { onMarketChange(m); setOpen(false) }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-foreground/5 ${m.ticker === ticker ? 'bg-foreground/[0.04]' : ''}`}
                  >
                    <span className="flex items-center gap-2"><TokenLogo ticker={m.ticker} size="sm" /><span className="font-mono text-xs">{m.ticker.slice(1)}/USD</span></span>
                    <span className="font-mono text-xs">{m.price ? `$${m.price.toLocaleString()}` : '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current price */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-lg font-semibold">{data.price ? `$${data.price.toLocaleString()}` : '—'}</span>
            <span className={`font-mono text-sm ${data.changePercent >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
            </span>
            <span className={`px-2 py-0.5 font-mono text-[10px] ${marketOpen ? 'bg-green-700/10 text-green-700' : 'bg-red-600/10 text-red-600'}`}>
              {marketOpen ? 'Market Open' : 'Market Closed'}
            </span>
          </div>

          <div className="h-6 w-px bg-foreground/10 flex-shrink-0" />

          <Stat label="Day High" value={usd(data.high24h)} />
          <Stat label="Day Low" value={usd(data.low24h)} />
          <Stat label="Day Open" value={usd(data.open)} />
          <Stat label="QOR/USD" value={qorUsd !== null ? `$${qorUsd.toPrecision(3)}` : '—'} title="CoinGecko, mainnet QOR. Testnet QOR has no value." />
          <Stat label="Index Price" value={usd(data.price)} title="Finnhub US-equity quote" />

          <div className="h-6 w-px bg-foreground/10 flex-shrink-0" />

          <Stat
            label="On-chain oracle"
            value={oracle ? `$${fromE8(oracle.price).toLocaleString()} · ${age}s ago` : 'stale / not reported'}
            tone={oracle ? '' : 'text-yellow-600'}
            title={marketOpen ? undefined : 'Outside US market hours the oracle holds the last close'}
          />
          <Stat label="Open Interest" value={withUsd(pool?.locked)} title="Collateral locked in open positions" />
          <Stat label="Open positions" value={pool ? pool.openCount.toString() : '—'} />
          <Stat label="Available Liquidity" value={withUsd(pool?.forfeited)} title="Forfeited collateral pool: the only source of trader profits" />
        </div>
      </div>
    </div>
  )
}
