# Architecture (the shape of every app)

Every app built from this boilerplate has the exact same shape. That sameness is
what lets one pipeline deploy anyone's app with no custom work.

## One app = one container = one URL
The backend and frontend build into a **single container image** that runs as **one
Cloud Run service** answering at **one web address**.

```
Internet ──► https://your-app-xxxx.asia-south1.run.app   (public, port 8080)
                          │
             ┌────────────┴──────────── ONE CONTAINER ────────────┐
             │  Next.js frontend  :8080  (0.0.0.0)   ← only public │
             │        │  proxies /api/*  (see next.config.mjs)     │
             │        ▼                                            │
             │  Express backend   :5000  (127.0.0.1)  ← private    │
             └────────────┬────────────────────────────────────────┘
                          ▼
        MongoDB Atlas (this app's own database)  +  GCS (uploaded files)
```

- **Only the Next.js frontend is public.** The Express backend is private (loopback
  only) and is reached exclusively through the frontend's `/api/*` proxy — so the
  browser only ever talks to one address, and there's no CORS.
- **Stateless:** the container's disk is wiped on every deploy and many copies may
  run, so all data lives in MongoDB and all files in GCS — never on local disk.
- **Secrets** (database URI, etc.) are injected at deploy time, never stored in code.

## How the code is organized
- **`backend/`** — a layered Express + TypeScript API:
  `Route → Validator(Zod) → Controller → Service → Repository → Model(Mongoose)`.
  Deep dive: [`../.ai/architecture.md`](../.ai/architecture.md) and
  [`../backend/README.md`](../backend/README.md).
- **`frontend/`** — a Next.js app (App Router, Tailwind, shadcn/ui, React Query,
  axios) that calls the API at same-origin `/api/*`.
- **Platform files** (`Dockerfile`, `server.js`, `frontend/next.config.mjs`, `scripts/`)
  wire it all together and are **not** meant to be edited —
  [`../.ai/deploy.md`](../.ai/deploy.md).

## What's fixed vs. what you build
| Fixed (don't touch) | Yours to build |
|---|---|
| Container shape, ports, `/api` proxy, deploy scripts | Backend resources & logic in `backend/src/**` |
| The single-URL, stateless model | Frontend pages & components in `frontend/` |
