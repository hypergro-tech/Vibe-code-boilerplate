# CLAUDE.md — read this first

This is the **Hypergro deploy boilerplate**: an Express + TypeScript backend and a
Next.js frontend that build into ONE container and go live on Cloud Run with a
single command. Your job is to build the user's app **inside this structure** so it
stays clean, standardized, and deployable.

## ⚡ FIRST RUN — before touching the frontend
`frontend/` is intentionally **empty** (Next.js moves fast, so it's generated, not
committed). Generate it once:
```bash
npm install
npm run bootstrap      # creates the Next.js app + the /api proxy + React Query + axios + shadcn
```
Never hand-create the Next.js app, and never edit the `rewrites()` in
`frontend/next.config.mjs` — that proxy is what lets the browser reach the private
backend with no CORS.

## The 10 rules you must never break
> Canonical copy: [`.ai/master-prompt.md`](.ai/master-prompt.md). Summary:

1. Stack is fixed: **Express+TS** backend, **Next.js+TS** frontend, **MongoDB** only.
2. **Never write to local disk.** Data → MongoDB; files → GCS (`backend/src/Storage/gcs.ts`).
3. **Never edit** `Dockerfile`, `server.js`, `frontend/next.config.mjs`, ports, or `scripts/`.
4. **Never hardcode secrets.** Read env only via `backend/src/Config/AppConfig.ts`.
5. API endpoints are **explicit Express routes** under `/api/...` — **never** Next.js API routes.
6. Each app has its **own MongoDB database named after the app** (`APP_NAME`).
7. The **backend is private** (`127.0.0.1:5000`); only the frontend is public.
8. The browser calls only **same-origin `/api/*`** (`frontend/src/lib/api.ts`).
9. Validate input with **Zod**; respond via **`sendSuccess`**; throw **`AppError`** subclasses.
10. Add entities by **copying the `resource.*` files** + updating barrels + routes + `openapi.ts`.

## Where things are
| I want to… | Read |
|---|---|
| Understand the layered backend + add an API resource | [`.ai/architecture.md`](.ai/architecture.md) |
| Know the stack, single-port model, naming rules | [`.ai/standards.md`](.ai/standards.md) |
| Store data or files correctly | [`.ai/data-storage.md`](.ai/data-storage.md) |
| Know what I must not edit, and how deploys work | [`.ai/deploy.md`](.ai/deploy.md) |
| Deep backend conventions | [`backend/README.md`](backend/README.md) |
| Human quickstart / how to deploy | [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md) |

Working inside `backend/` or `frontend/`? Each has its own short `CLAUDE.md` too.
