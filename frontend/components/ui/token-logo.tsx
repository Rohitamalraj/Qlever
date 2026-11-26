"use client"

import React from 'react'
import { markFor, StockMark } from '@/components/ui/stock-marks'

interface TokenLogoProps {
  ticker: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'w-6 h-6 p-1 text-[9px]',
  md: 'w-7 h-7 p-1.5 text-[10px]',
  lg: 'w-9 h-9 p-2 text-xs',
}

/** Brand logo of the underlying stock on a white disc; a neutral glyph for a sealed / unknown asset. */
export function TokenLogo({ ticker, size = 'md', className = '' }: TokenLogoProps) {
  const mark = markFor(ticker)
  if (!mark) {
    return (
      <div className={`${sizeMap[size]} ${className} rounded-full bg-foreground/10 text-muted-foreground flex items-center justify-center font-mono shrink-0`}>
        ?
      </div>
    )
  }
  return (
    <div className={`${sizeMap[size]} ${className} rounded-full bg-white border border-foreground/10 flex items-center justify-center shrink-0 overflow-hidden`}>
      <StockMark mark={mark} />
    </div>
  )
}
