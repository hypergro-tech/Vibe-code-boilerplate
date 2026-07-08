# AGENTS.md

This project uses AI guardrails so any coding agent (Cursor, Codex, Gemini CLI,
Claude Code, …) produces clean, deployable code.

**Start with [`CLAUDE.md`](CLAUDE.md)** — it has the FIRST-RUN step and the 10 hard
rules. The detailed, canonical rules live in the [`.ai/`](.ai/) folder:

- [`.ai/master-prompt.md`](.ai/master-prompt.md) — the rules you must never break
- [`.ai/architecture.md`](.ai/architecture.md) — the layered backend + add-a-resource recipe
- [`.ai/standards.md`](.ai/standards.md) — stack, single-port model, statelessness, naming
- [`.ai/data-storage.md`](.ai/data-storage.md) — MongoDB + GCS (never local disk)
- [`.ai/deploy.md`](.ai/deploy.md) — files you must never edit + how deploys work

TL;DR: Express+TypeScript backend and Next.js+TypeScript frontend, MongoDB only,
never write to local disk, never edit the Dockerfile/`server.js`/`next.config.mjs`
proxy, never hardcode secrets, add API endpoints as explicit Express routes under
`/api/*` (never Next.js API routes).
