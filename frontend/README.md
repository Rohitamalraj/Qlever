# Qlever frontend

Next.js 16 app for Qlever: landing page, trader terminal (`/trade`, `/portfolio`), DCA plans (`/sip`) and the Keeper dashboard (`/keeper`).

```bash
cp .env.example .env.local   # fill in the deployed contract addresses
npm install
npm run dev
```

- All encryption/decryption runs in the browser (`lib/qlever.ts`, QoreSeal ML-KEM-1024).
- Quotes are real Finnhub US-equity prices (server-side route, key never reaches the browser); chart candles are CoinGecko tokenized-stock OHLC. Settlement uses the on-chain PriceFeedAdapter.
- Trader seal keys are derived from a wallet signature and never stored. The Keeper unlocks with its recovery phrase, held in tab memory only.
