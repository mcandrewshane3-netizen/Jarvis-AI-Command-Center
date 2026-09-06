---
name: Crypto volume boundaries
description: How to handle provider-backed crypto bars when the provider omits volume.
---

Allow read-only conversational market rankings to use real OHLC-derived signals conservatively when crypto volume is unavailable, with an explicit volume limitation and zero liquidity contribution. Never carry that fallback into PAPER or live-execution candidate construction.

**Why:** Twelve Data can return current crypto OHLC bars without a volume field. Treating that as complete provider failure hides valid price momentum, while inventing liquidity or relaxing execution gates would create unsafe trade evidence.

**How to apply:** For informational rankings, label volume unavailable, rank only assets with valid current price bars, and keep the result explicitly non-executable. Trading strategies, universe filters, risk checks, and PAPER cycles must continue requiring their real liquidity evidence.