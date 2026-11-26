"use client"

import React, { useMemo, useState } from 'react'
import { Loader2, Unlock } from 'lucide-react'
import { useQorUsd, fmtUsd } from '@/hooks/use-qor-usd'
import { TokenLogo } from '@/components/ui/token-logo'
import { enrich, fmtPrice, fmtQor } from '@/lib/position-math'
import type { AssetSymbol } from '@/lib/assets'
import type { TraderPosition } from '@/hooks/use-qlever'

interface PositionsPanelProps {
  positions: TraderPosition[]
  marks: Partial<Record<AssetSymbol, number>>
  unlocked: boolean
  onUnlock: () => void
  onClosePosition: (p: TraderPosition) => void
  closingId: bigint | null
  isConnected: boolean
}

const COLS = 'grid grid-cols-[1.5fr_1fr_0.7fr_1fr_1fr_1fr_1fr_0.8fr] gap-2'
const sealed = <span className="font-mono text-xs text-muted-foreground">Sealed</span>

export function PositionsPanel({ positions, marks, unlocked, onUnlock, onClosePosition, closingId, isConnected }: PositionsPanelProps) {
  const [tab, setTab] = useState<'positions' | 'trades'>('positions')
  const qorUsd = useQorUsd()
  const rows = useMemo(() => positions.map((p) => ({ raw: p, e: enrich(p, marks) })), [positions, marks])
  const open = rows.filter((r) => r.e.status === 'open')
  const history = rows.filter((r) => r.e.status !== 'open')
  const hasSealed = rows.some((r) => !r.e.decrypted)

  return (
    <div className="h-full flex flex-col bg-background border border-foreground/10">
      <div className="p-4 border-b border-foreground/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {([['positions', 'Positions', open.length], ['trades', 'Trades', history.length]] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 font-mono text-xs transition-colors ${tab === key ? 'bg-foreground text-background' : 'text-foreground/70 hover:text-foreground hover:bg-foreground/5'}`}
            >
              {label}
              {count > 0 && <span className="ml-1.5 px-1.5 py-0.5 bg-foreground/10 font-mono text-[10px]">{count}</span>}
            </button>
          ))}
        </div>
        {isConnected && !unlocked && positions.length > 0 && (
          <button onClick={onUnlock} className="flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] border border-foreground/20 hover:bg-foreground/5">
            <Unlock className="w-3 h-3" /> Decrypt my positions
          </button>
        )}
      </div>

      {tab === 'positions' && (
        open.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-muted-foreground font-mono text-xs mb-2">{isConnected ? 'No open positions' : 'Connect a wallet to see your positions'}</div>
            <div className="font-mono text-[10px] text-muted-foreground/70">Only you and the Keeper can read a position&apos;s details.</div>
          </div>
        ) : (
          <>
            <div className={`${COLS} px-4 py-2 font-mono text-[10px] text-muted-foreground border-b border-foreground/10`}>
              <div>POSITION</div>
              <div className="text-right">SIZE</div>
              <div className="text-right">LEV</div>
              <div className="text-right">ENTRY</div>
              <div className="text-right">MARK</div>
              <div className="text-right">LIQ. PRICE</div>
              <div className="text-right">PNL</div>
              <div className="text-right">ACTION</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {open.map(({ raw, e }) => (
                <div key={e.id.toString()} className={`${COLS} px-4 py-3 border-b border-foreground/10 hover:bg-foreground/[0.02] transition-colors`}>
                  <div className="flex items-center gap-2">
                    <TokenLogo ticker={e.asset ?? 's?'} size="sm" />
                    <div className="flex flex-col">
                      <span className="font-mono text-xs">#{e.id.toString()} {e.ticker ? `${e.ticker}/USD` : 'Sealed asset'}</span>
                      <span className={`font-mono text-[10px] ${e.direction === 'LONG' ? 'text-green-700' : e.direction === 'SHORT' ? 'text-red-600' : 'text-muted-foreground'}`}>{e.direction}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end font-mono text-xs">{e.size === null ? sealed : <div className="flex flex-col items-end"><span>{fmtQor(e.size)} QOR</span><span className="text-[10px] text-muted-foreground">{fmtUsd(e.size, qorUsd)}</span></div>}</div>
                  <div className="flex items-center justify-end font-mono text-xs">{e.leverage === null ? sealed : `${e.leverage}x`}</div>
                  <div className="flex items-center justify-end font-mono text-xs">{e.entry === null ? sealed : `$${fmtPrice(e.entry)}`}</div>
                  <div className="flex items-center justify-end">
                    {e.mark === null ? sealed : (
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-xs">${fmtPrice(e.mark)}</span>
                        {e.entry !== null && <span className={`font-mono text-[10px] ${e.mark >= e.entry ? 'text-green-700/70' : 'text-red-600/70'}`}>{e.mark >= e.entry ? '+' : ''}{(e.mark - e.entry).toFixed(4)}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end font-mono text-xs text-red-600">{e.liq === null ? sealed : `$${fmtPrice(e.liq)}`}</div>
                  <div className="flex items-center justify-end">
                    {e.pnl === null ? sealed : (
                      <div className="flex flex-col items-end" title="Theoretical PnL. The vault pays profits only from the forfeited pool and caps losses at the collateral.">
                        <span className={`font-mono text-xs ${e.pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>{e.pnl >= 0 ? '+' : ''}{fmtQor(e.pnl)} QOR {qorUsd !== null && <span className="opacity-70">({fmtUsd(e.pnl, qorUsd)})</span>}</span>
                        <span className={`font-mono text-[10px] ${e.pnl >= 0 ? 'text-green-700/70' : 'text-red-600/70'}`}>{e.pnlPct !== null && `${e.pnlPct >= 0 ? '+' : ''}${e.pnlPct.toFixed(2)}%`}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => onClosePosition(raw)}
                      disabled={!raw.fields || closingId !== null}
                      title={raw.fields ? 'Reveal and close' : 'Decrypt your positions first'}
                      className="px-3 py-1 font-mono text-[10px] bg-red-600/10 text-red-600 hover:bg-red-600/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {closingId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Close'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      )}

      {tab === 'trades' && (
        history.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground font-mono text-xs">No closed trades yet</div>
        ) : (
          <>
            <div className="grid grid-cols-[1.5fr_0.8fr_1fr_1fr_1.2fr] gap-2 px-4 py-2 font-mono text-[10px] text-muted-foreground border-b border-foreground/10">
              <div>POSITION</div><div className="text-right">LEV</div><div className="text-right">COLLATERAL</div><div className="text-right">RESULT</div><div className="text-right">STATUS</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {history.map(({ e }) => (
                <div key={e.id.toString()} className="grid grid-cols-[1.5fr_0.8fr_1fr_1fr_1.2fr] gap-2 px-4 py-3 border-b border-foreground/10 font-mono text-xs">
                  <div className="flex items-center gap-2"><TokenLogo ticker={e.asset ?? 's?'} size="sm" />#{e.id.toString()} {e.ticker ? `${e.ticker} ${e.direction}` : 'Sealed'}</div>
                  <div className="text-right">{e.leverage === null ? '—' : `${e.leverage}x`}</div>
                  <div className="text-right">{fmtQor(e.collateral)} QOR <span className="text-muted-foreground text-[10px]">{fmtUsd(e.collateral, qorUsd)}</span></div>
                  <div className={`text-right ${e.realized === null ? 'text-muted-foreground' : e.realized >= 0 ? 'text-green-700' : 'text-red-600'}`}>{e.realized === null ? '—' : `${e.realized >= 0 ? '+' : ''}${fmtQor(e.realized)} QOR`}</div>
                  <div className={`text-right ${e.status === 'liquidated' ? 'text-red-600' : 'text-muted-foreground'}`}>{e.status === 'liquidated' ? 'LIQUIDATED' : 'CLOSED'}</div>
                </div>
              ))}
            </div>
          </>
        )
      )}

      {hasSealed && isConnected && <div className="px-4 py-2 font-mono text-[10px] text-muted-foreground border-t border-foreground/10">Some positions are still sealed. Decrypt them to see entry, mark, liquidation price and PnL.</div>}
    </div>
  )
}
