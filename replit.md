# JARVIS

An iPad-first personal AI command center for daily briefings, work, finances, markets, and controlled automations.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/jarvis run dev` — run the JARVIS web app through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/jarvis/src/App.tsx` — Phase 1 app shell, navigation, pages, and local interactions
- `artifacts/jarvis/src/index.css` — JARVIS visual system and responsive layout
- `lib/api-spec/openapi.yaml` — future server API contract source of truth
- `lib/db/src/schema/` — future persistent data models

## Architecture decisions

- Phase 1 is deliberately frontend-only; all sample financial and market information is visibly labeled Demo data or Paper trading.
- Live brokerage actions remain unavailable until official Robinhood authentication, deterministic risk controls, and audit logging are implemented.
- The app is web-first and responsive so it can run in iPad Safari and later be installed as a PWA.

## Product

Phase 1 includes the home dashboard, JARVIS conversation surface, work, finance, markets, personal routines, automations, integrations, and settings screens. Navigation and local demo interactions work.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Never represent sample values as live account or market data.
- Never enable order execution without the deterministic risk engine and global kill switch.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
