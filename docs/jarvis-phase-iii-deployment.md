# JARVIS Phase III deployment recommendation

## Lowest-cost safe architecture

Use a hybrid Replit deployment:

1. Keep the JARVIS frontend as its existing Static Deployment.
2. Publish the API as an Autoscale Deployment so authenticated chat, voice, dashboard, and manual requests cost nothing while idle.
3. Add one hourly Scheduled Deployment using the same repository and database:
   - Build: `pnpm --filter @workspace/api-server run build`
   - Run: `pnpm --filter @workspace/api-server run start:paper-scheduler`
4. Set `JARVIS_API_URL` to the published API origin and store `PAPER_SCHEDULER_SECRET` as a production secret.

The scheduled worker leases each due persistent PAPER session, calls the existing authenticated autonomous-cycle route, and uses a stable idempotency key. It does not implement trading logic.

## Why not always-on compute

The strategies operate on closed one-hour bars and open positions already receive the provider's high-priority path. An hourly Scheduled Deployment is therefore sufficient for the current PAPER system. A Reserved VM would remain running during long idle periods and is not justified unless the strategy interval or voice architecture later requires a persistent process.

## Reliability boundaries

- PostgreSQL stores portfolios, positions, sessions, leases, decisions, outcomes, learning, notifications, and controls.
- Expired leases allow safe restart recovery.
- Cycle idempotency plus portfolio optimistic concurrency prevents duplicate retries and overlapping orders.
- The kill switch and PAPER-only checks remain server-authoritative.
- Scheduled work manages open positions before bounded discovery.
- AI budgets never bypass the required AI gate.

## Expected cost

Replit documentation describes usage-based billing but does not publish exact dollar rates for this project's Autoscale, Scheduled Deployment, or PostgreSQL usage. Exact monthly hosting and database cost is therefore **UNKNOWN** until the Publishing estimate is shown for the selected resources.

Expected cost behavior:

- Static frontend: configuration-dependent.
- Autoscale API: usage-based; no compute charge while idle.
- Hourly scheduler: usage-based only during each execution.
- PostgreSQL: existing project database; additional production cost is configuration-dependent.
- OpenAI and Grok: candidate-gated and bounded by the per-user daily research budget.
- Twelve Data: continues using the existing plan and request budget; no upgrade is required by this phase.

No deployment or billable resource is created by this recommendation.