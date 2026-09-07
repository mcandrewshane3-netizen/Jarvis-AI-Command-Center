# JARVIS AI Command Center — Claude Code Handoff

## Start here

This repository is the working JARVIS project. For handoff, DO NOT start from current `main` without reviewing history first. Current `main` contains a later commit titled `Delete jarvis` and is not the safe handoff baseline.

Use this branch as the handoff baseline:

- Branch: `codex/voice-auto-stop`
- Baseline commit: `382390e9b3997ec8b7823009cce7c0cd948bab9b`
- Repository: `mcandrewshane3-netizen/Jarvis-AI-Command-Center`
- Production URL: `https://jarvis-ai-command-center.replit.app`

The baseline includes the cinematic/core-first JARVIS UI, hands-free startup attempt, Safari/iPad audio playback hardening, conversation persistence/recovery, API/backend wiring, cost controls, CI, and PAPER-only market safeguards.

## Product goal

Build a JARVIS-like personal AI assistant experience for iPad where the user opens the app and interacts primarily by voice.

The intended interaction loop is the single most important requirement:

1. User opens the app.
2. JARVIS greets the user aloud.
3. JARVIS automatically listens.
4. User speaks naturally without pressing a button.
5. JARVIS detects end-of-speech automatically.
6. JARVIS submits the transcript immediately.
7. JARVIS responds quickly and conversationally.
8. JARVIS speaks the answer aloud.
9. The animated core visibly reacts while listening, thinking, and speaking.
10. Only after speaking finishes, JARVIS returns to listening.

Text chat is secondary fallback UI, not the primary experience.

## Current UX direction

Use an original cinematic machine-intelligence aesthetic inspired by the feeling of futuristic holographic AI interfaces, without copying Marvel artwork or proprietary assets.

Desired characteristics:

- Large animated luminous AI core as the dominant centerpiece.
- Dark metallic / black background.
- Cyan / blue holographic geometry.
- Peripheral HUD modules around the core.
- Subtle red accents for threat/degraded/critical states.
- Core animation changes for LISTENING, THINKING, and SPEAKING.
- Voice waveform / listening indicator.
- Text transcript remains visually subordinate.
- iPad-first responsive layout.

## Current major bug

On the physical iPad, JARVIS can enter LISTENING and continue listening indefinitely instead of recognizing that the user has finished speaking, submitting the transcript, answering, and speaking back.

Do not add unrelated features until this is fixed.

### Required fix

Implement deterministic end-of-speech behavior around browser speech recognition:

- Track interim and final transcript activity timestamps.
- Once meaningful speech has been detected, use a short silence window to automatically stop recognition and submit.
- Recommended starting silence window: roughly 900–1400 ms after the last transcript activity; tune on iPad.
- Add a maximum listening duration fail-safe so the app cannot remain stuck in LISTENING indefinitely.
- Do not submit empty transcripts.
- Do not double-submit when `recognition.onend` fires after an intentional stop.
- Make submission idempotent for a listening turn.
- Preserve interruption / cancel behavior.
- After submission, transition to THINKING.
- Do not restart microphone capture while TTS is still playing.
- Restart listening only after cloud TTS or device fallback fully settles.

## Existing Safari/iPad voice playback hardening

The baseline already includes a first-touch audio unlock strategy and reusable audio element for Safari. It also includes cloud-to-device voice fallback and playback-completion gating.

Important files include:

- `artifacts/jarvis/src/hooks/use-voice.ts`
- `artifacts/jarvis/src/lib/audio-playback.ts`
- `artifacts/jarvis/src/pages/JarvisPage.tsx`
- `artifacts/jarvis/src/main.tsx`
- `artifacts/jarvis/src/core-first.css`
- `artifacts/jarvis/src/cinematic.css`

Inspect the repository before changing architecture.

## Communication behavior

JARVIS should sound concise, competent, and conversational.

Priorities:

- First sentence should directly answer the request.
- Avoid debug dumps and unnecessary telemetry in normal replies.
- Keep normal spoken responses short enough to feel fast.
- Technical detail can remain available in text or secondary panels.
- Prefer one provider for ordinary AUTO requests to reduce cost and latency.
- Use larger/multi-provider paths only when complexity genuinely requires it.

## Cost constraint

The project has already incurred meaningful development cost. Optimize for fewer unnecessary model calls, fewer Replit repair cycles, and measurable progress toward the core voice loop.

Do not spend effort on cosmetic expansion or unrelated modules until voice works reliably on physical iPad hardware.

## Safety / trading constraints

Keep all trading functionality in `PAPER_RESEARCH_ONLY` / PAPER mode unless the user explicitly designs and approves a separate live-trading architecture later.

Do not weaken:

- live-trading disablement
- kill switches
- capital-preservation gates
- provider-data freshness checks
- authentication boundaries
- deterministic market-data safeguards

## Validation requirement

Do not declare the voice feature finished based only on unit tests or desktop emulation.

The release acceptance test is physical iPad behavior:

`open -> greet -> listen -> user speaks -> silence detected -> submit -> answer -> speak aloud -> listen again`

This loop must work repeatedly without tapping a microphone button.

Also verify:

- no duplicate transcript submission
- no microphone capture during TTS playback
- no infinite LISTENING state
- no silent failure when cloud TTS is blocked
- device voice fallback works
- text chat still works
- conversation history still restores
- production build passes
- existing API test suite passes
- PAPER-only safeguards remain intact

## CI / release discipline

The existing GitHub CI should remain authoritative. Before merging behavioral changes:

1. Typecheck passes.
2. API tests pass.
3. Production build passes.
4. Review the voice lifecycle changes for regressions.
5. Merge to a clean release branch/main only after validation.
6. Sync the exact validated commit to Replit.
7. Publish.
8. Perform the physical iPad acceptance test.

## Important repository state warning

At handoff time, repository `main` is at commit `20cae4228d43e7b1092ab5a0e823cce1f5586b37` with commit message `Delete jarvis`.

Do not assume `main` is the desired source of truth. Preserve history. Start from `codex/voice-auto-stop` at `382390e9b3997ec8b7823009cce7c0cd948bab9b`, inspect later commits deliberately, and recover/cherry-pick only changes that are actually wanted.

## First task for Claude Code

1. Check out `codex/voice-auto-stop`.
2. Read this file completely.
3. Inspect the current voice state machine and `use-voice.ts`.
4. Implement robust silence-based auto-stop plus maximum-listen timeout.
5. Add focused tests for end-of-speech and duplicate-submission prevention.
6. Run existing typecheck/tests/build.
7. Do not redesign unrelated systems.
8. Produce a short test plan specifically for the physical iPad.

The objective is not another prototype pass. The objective is to make the core hands-free JARVIS conversation loop reliable.