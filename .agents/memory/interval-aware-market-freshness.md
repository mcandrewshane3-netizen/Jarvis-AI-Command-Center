---
name: Interval-aware market freshness
description: How JARVIS distinguishes OHLCV interval boundaries from exact quote timestamps.
---

Measure OHLCV freshness from the requested interval's close, not from the provider's interval-start timestamp. Continue measuring quote freshness from the exact provider timestamp, and fail closed for unknown intervals or genuinely delayed data.

**Why:** Twelve Data timestamps candles at interval boundaries. Treating a recently completed hourly candle like an hour-old quote incorrectly marks valid 24/7 crypto data stale.

**How to apply:** Pass the requested interval into freshness classification for bars only. Do not extend global freshness thresholds or apply market-session exceptions to 24/7 crypto.