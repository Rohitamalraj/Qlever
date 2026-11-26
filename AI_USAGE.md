# AI usage

Qlever was built with **Claude Code** (Anthropic) as a pair programmer, directed and reviewed by the team.

## What AI helped with
- **Contracts:** drafting `QleverVault`, `PriceFeedAdapter` and `TierRegistry`, and the Foundry test suite (34 tests).
- **Services:** the price reporter (Finnhub → signed on-chain batches), the Keeper and the end-to-end rehearsal script.
- **Frontend:** adapting the trading UI, the QoreSeal sealing/decryption flow, PnL views, tier verification and the landing page.
- **QoreChain setup:** reading the QoreChain docs, installing `qorechaind` in WSL, creating accounts, registering ML-DSA-87 and ML-KEM keys, opening EVM windows and deploying to `qorechain-diana`.
- **Debugging:** e.g. EVM key derivation (`eth_secp256k1`), the 10,000-block log limit, clock drift against block time, and Finnhub rate limits.

## What the team did
- Product direction, the PRD, design feedback and every decision on scope.
- Review of the code and of each change before it was accepted.
- Faucet claims and all wallet actions that need a human.

## Verification
AI output was checked by running it: `forge test`, the service tests, and a live rehearsal against QoreChain testnet
that opens sealed positions, rejects a fabricated liquidation, liquidates a crossed position and settles a close.
Private keys and API keys were never committed.
