# Qlever

Quantum-safe confidential leveraged trading of synthetic US stocks on **QoreChain** (Build Before Q-Day).

A position's asset, entry price, leverage, direction and liquidation price are sealed in the browser with
**QoreSeal (ML-KEM-1024)** to the trader and a Keeper. Only a `keccak256` commitment and the QOR collateral go
on-chain. The Keeper decrypts off-chain and liquidates with a reveal the vault hash-verifies; a fabricated reveal
reverts. Closing uses the same reveal and pays collateral ± PnL.

| Folder | What |
|---|---|
| `contracts/` | Foundry: `QleverVault`, `PriceFeedAdapter` (signed multi-asset relay), `TierRegistry` (oracle-signed tier credentials) |
| `services/` | Price reporter (Finnhub → signed on-chain batch), Keeper (decrypt + liquidate), rehearsal script |
| `frontend/` | Next.js app: landing, trade, portfolio, DCA, Keeper dashboard |

## Testnet deployment (`qorechain-diana`, EVM chain 9800)

| Contract | Address |
|---|---|
| PriceFeedAdapter | `0xAAeaCC766C991CE97f7A9fDa2A1810ca0F5bff2A` |
| TierRegistry | `0x0Afb21b75e0F35ca7DdCBf13BdD6F596ecE6E633` |
| QleverVault | `0xdeF85bBD834FdF034096AE865089B630E247E246` |

## Run

```bash
cd contracts && forge test                     # contract tests
cd services && npm i && npm test               # envelope tests
cd frontend && cp .env.example .env.local && npm i && npm run build && npm start
```

## Trade-offs (MVP)

- Single permissioned Keeper; single signed price relay (Pyth is not available on QoreChain).
- Profits are paid only from forfeited collateral; losses are capped at the collateral.
- Sealed entry prices are verified against the oracle's recorded 30-minute high/low band.
- Tier verification is a wallet-activity score signed by a tier oracle, not KYC.
- DCA plans run in the browser while the page is open.
- Testnet only; collateral is test QOR.
