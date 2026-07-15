# Keepscape contributor guide

## Product invariant

Keepscape turns real source material into a place a family can explore without inventing family history.
Every factual person, place, object, quote, and date in an exhibit must resolve to a photo region, transcript
timecode, or explicit human confirmation. Generated scenery and connective language are always labeled as
interpretation. Never clone a person's voice or synthesize a deceased person's likeness.

## Commands

- Install: `pnpm install`
- Develop: `pnpm dev`
- Unit tests: `pnpm test`
- End-to-end tests: `pnpm test:e2e`
- Full local gate: `pnpm check`

## Engineering rules

- Keep OpenAI credentials server-only and load them from the environment.
- Validate every API boundary with Zod.
- Never execute visitor-supplied code directly on the host.
- Generated exhibits use the typed interaction runtime; live Codex runs in an isolated, no-network workspace.
- Live Codex execution must be opt-in through `KEEPSCAPE_ENABLE_CODEX`.
- Keep the built-in case deterministic and fully usable without credentials.
- Prefer accessible native elements; keyboard and reduced-motion behavior are release blockers.
