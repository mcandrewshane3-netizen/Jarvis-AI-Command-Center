---
name: Trading UI truthfulness
description: Safety rule for presenting market, brokerage, and execution state in JARVIS.
---

Never infer or simulate brokerage connection, market prices, execution mode, kill-switch state, or RiskEngine results in the client. Display an explicit unavailable or not-configured state until an authenticated server endpoint provides the authoritative value.

**Why:** A visually convincing command center can make fabricated or client-only controls look operational, which is unsafe for financial decisions.

**How to apply:** Any future Markets or trading UI must read persisted server data, keep live execution disabled by default, and make disconnected controls visibly read-only.