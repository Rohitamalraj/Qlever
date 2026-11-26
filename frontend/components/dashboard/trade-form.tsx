"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { LeverageSlider } from '@/components/ui/leverage-slider'
import { suggestLiqPrice } from '@/lib/qlever'
import type { TxState } from '@/hooks/use-qlever'

interface TradeFormProps {
  ticker: string
  currentPrice: number
  maxLeverage: number
  isConnected: boolean
  isDeployed: boolean
  balance?: string
  txStatus: TxState
  onTrade: (params: TradeParams) => void
  isVerified?: boolean
  onVerifyClick?: () => void
}

export interface TradeParams {
  isLong: boolean
  collateral: string // QOR
  leverage: number
  liqPrice: number // USD
}

const STATUS_LABEL: Record<TxState, string> = {
  idle: '',
  'signing-keys': 'Sign to derive your seal keys...',
  sealing: 'Sealing with ML-KEM-1024...',
  opening: 'Submitting commitment...',
  closing: 'Closing...',
}

export function TradeForm({ ticker, currentPrice, maxLeverage, isConnected, isDeployed, balance, txStatus, onTrade, isVerified = false, onVerifyClick }: TradeFormProps) {
  const [isLong, setIsLong] = useState(true)
  const [collateral, setCollateral] = useState('')
  const [leverage, setLeverage] = useState(2)
  const [liqOverride, setLiqOverride] = useState('')

  const suggested = useMemo(() => (currentPrice ? suggestLiqPrice(currentPrice, leverage, isLong) : 0), [currentPrice, leverage, isLong])
  useEffect(() => { setLiqOverride('') }, [leverage, isLong])
  const liqPrice = liqOverride ? parseFloat(liqOverride) : suggested

  const collateralNum = parseFloat(collateral) || 0
  const size = collateralNum * leverage
  const validLiq = isLong ? liqPrice > 0 && liqPrice < currentPrice : liqPrice > currentPrice
  const busy = txStatus !== 'idle'
  const canSubmit = isConnected && isDeployed && collateralNum > 0 && validLiq && !busy && currentPrice > 0

  return (
    <div className="h-full min-h-0 flex flex-col bg-background border border-foreground/10">
      <div className="flex border-b border-foreground/10">
        <button onClick={() => setIsLong(true)} className={`flex-1 px-4 py-3 font-mono text-xs transition-colors ${isLong ? 'bg-green-700 text-white' : 'text-foreground/70 hover:bg-foreground/5'}`}>Long</button>
        <button onClick={() => setIsLong(false)} className={`flex-1 px-4 py-3 font-mono text-xs transition-colors border-l border-foreground/10 ${!isLong ? 'bg-red-600 text-white' : 'text-foreground/70 hover:bg-foreground/5'}`}>Short</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-muted-foreground">Collateral</span>
            <span className="font-mono text-xs">QOR{balance ? ` · bal ${balance}` : ''}</span>
          </div>
          <input type="number" min="0" value={collateral} onChange={(e) => setCollateral(e.target.value)} placeholder="0.00" className="w-full text-2xl font-mono bg-transparent border-none outline-none" />
        </div>

        <div className="pt-3 border-t border-foreground/10">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-muted-foreground">{isLong ? 'Long' : 'Short'} exposure</span>
            <span className="font-mono text-xs">{ticker.slice(1)}</span>
          </div>
          <div className="text-xl font-mono">{size.toFixed(4)} QOR</div>
        </div>

        <div className="pt-3 border-t border-foreground/10">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] text-muted-foreground">Leverage</span>
            <span className="font-mono text-xs">{leverage.toFixed(1)}x</span>
          </div>
          <LeverageSlider value={leverage} onChange={setLeverage} max={maxLeverage} tierCap={maxLeverage} />
          <div className="font-mono text-[10px] text-muted-foreground mt-2">Tier cap {maxLeverage}x. Checked at reveal, since leverage is sealed.</div>
          {isConnected && !isVerified && onVerifyClick && (
            <button onClick={onVerifyClick} className="mt-2 w-full py-2 border border-foreground/30 font-mono text-[10px] hover:bg-foreground/5">Verify identity to unlock up to 10x</button>
          )}
        </div>

        <div className="pt-3 border-t border-foreground/10">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-muted-foreground">Liquidation price (USD)</span>
            <button onClick={() => setLiqOverride('')} className="font-mono text-[10px] text-muted-foreground hover:text-foreground">auto</button>
          </div>
          <input
            type="number"
            value={liqOverride || (suggested ? suggested.toFixed(2) : '')}
            onChange={(e) => setLiqOverride(e.target.value)}
            className="w-full font-mono text-sm bg-transparent border border-foreground/10 px-3 py-2 outline-none focus:border-foreground/40"
          />
          {!validLiq && liqPrice > 0 && (
            <div className="font-mono text-[10px] text-red-600 mt-1">{isLong ? 'Must be below' : 'Must be above'} the current price.</div>
          )}
        </div>

        <div className="flex gap-2 p-3 border border-foreground/10 bg-foreground/[0.02]">
          <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
            Leverage, direction and liquidation price are encrypted in your browser (ML-KEM-1024) to you and the Keeper. Only a hash and your collateral go on-chain.
          </p>
        </div>
      </div>

      <div className="shrink-0 p-4 border-t border-foreground/10 bg-background">
        {!isDeployed && <div className="font-mono text-[10px] text-yellow-600 mb-2">Contracts not configured. Set NEXT_PUBLIC_VAULT_ADDRESS and NEXT_PUBLIC_FEED_ADDRESS.</div>}
        <button
          onClick={() => onTrade({ isLong, collateral, leverage, liqPrice })}
          disabled={!canSubmit}
          className={`w-full py-3 font-mono text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white ${isLong ? 'bg-green-700 hover:bg-green-800' : 'bg-red-600 hover:bg-red-700'}`}
        >
          {busy ? (<><Loader2 className="w-4 h-4 animate-spin" />{STATUS_LABEL[txStatus]}</>) : !isConnected ? 'Connect wallet to trade' : `Seal & open ${isLong ? 'long' : 'short'}`}
        </button>
      </div>
    </div>
  )
}
