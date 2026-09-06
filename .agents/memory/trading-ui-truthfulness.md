---
name: Trading UI truthfulness
description: Safety rule for presenting market, brokerage, and execution state in JARVIS.
---

Never infer or simulate brokerage connection, market prices, execution mode, kill-switch state, or RiskEngine results in the client. Display an explicit unavailable or not-configured state until an authenticated server endpoint provides the authoritative value.

Provider bid/ask availability and PAPER execution-cost provenance must remain separate. Missing provider bid/ask is always labeled unavailable; if the PAPER broker uses its deterministic model, label that cost `MODELED`, never provider-derived.

**Why:** A visually convincing command center can make fabricated or client-only controls look operational, which is unsafe for financial decisions. Modeled execution costs are legitimate simulation inputs but are not market observations.

**How to apply:** Any future Markets or trading UI must read persisted server data, keep live execution disabled by default, make disconnected controls visibly read-only, and preserve provider-versus-modeled provenance.