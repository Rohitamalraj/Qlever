import React from "react"
import type { Metadata } from 'next'
import { Figtree, Geist_Mono } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: '--font-figtree'
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: '--font-geist-mono'
})

export const metadata: Metadata = {
  title: 'Qlever — Quantum-Safe Confidential Leveraged Trading',
  description: 'Leverage, direction and liquidation price sealed with ML-KEM-1024 and committed on-chain. Revealed only, and verified, at the moment of liquidation or close.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
