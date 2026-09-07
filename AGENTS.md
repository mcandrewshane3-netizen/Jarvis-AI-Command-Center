# JARVIS development instructions

This repository uses GitHub as the source of truth and Replit only as the runtime/deployment target.

## Working model

- Do all new development on a feature branch created from `main`.
- Prefer the `codex/` branch namespace for Codex-driven work.
- Never make feature changes directly on production `main`.
- Every change must go through the existing JARVIS CI workflow before merge.
- Merge only after typecheck, API tests, and production build succeed.
- Replit should only receive code after GitHub validation and merge.

## Prototype priorities

Build toward a reliable iPad-first JARVIS prototype with:

1. Authenticated conversational AI using the real provider layer, never simulated chat in production.
2. Reliable iPad/iOS voice input and speech output with graceful text fallback.
3. Persistent conversations, assistant state, preferences, and user-facing history where applicable.
4. Fast, responsive dashboard/navigation with clear loading, empty, offline, reconnect, and error states.
5. Strict security boundaries for auth, CORS, origin enforcement, secrets, and privileged actions.
6. Cost-aware provider usage and bounded retries.
7. Strong observability and health checks for production-critical dependencies.
8. No live autonomous trading. Trading remains PAPER/research-only until explicitly enabled through a separately reviewed safety milestone.

## Release gate

Before calling a prototype change publish-ready:

- Run the full workspace typecheck.
- Run the full API/JARVIS test suites.
- Run production builds.
- Verify authenticated chat end-to-end against real provider integrations.
- Verify voice behavior on iPad/iOS paths and text fallback.
- Verify navigation, persistence, reconnect behavior, and user-visible error handling.
- Verify the cross-origin security boundary remains locked down.
- Open a PR against `main` and require JARVIS CI to pass.

Do not weaken tests, auth checks, security controls, provider safeguards, or trading safeguards merely to make a build pass.
