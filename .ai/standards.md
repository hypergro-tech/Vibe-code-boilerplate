# Standards — stack, the single-port model, statelessness, naming

## The stack (fixed)
- **Backend:** Node.js + Express + TypeScript, ESM (`"type": "module"`), NodeNext.
  Relative imports use a `.js` extension; use `import type` for type-only imports
  (`verbatimModuleSyntax` is on).
- **Frontend:** Next.js + TypeScript (App Router), Tailwind, shadcn/ui, React Query,
  axios.
- **Database:** MongoDB (Mongoose). Nothing else.

Do not introduce other languages, frameworks, ORMs, or databases.

## The single-port model (why the app "just works" at one URL)
Inside the one container, two processes run:

```
Browser ──► Next.js (PUBLIC, port 8080, 0.0.0.0)
                │  next.config.mjs rewrites /api/* ─┐
                ▼                                    ▼
             (your React UI)          Express (PRIVATE, 127.0.0.1:5000)
```

- The **frontend** is the only public thing. The **backend is private** (loopback only).
- The frontend **proxies every `/api/*` request** to the backend, preserving the
  `/api` prefix. So the browser always calls **same-origin `/api/...`** — there is
  **no separate API URL and no CORS**.
- From the frontend, always use `frontend/src/lib/api.ts` (`baseURL: '/api'`).
  Never hardcode `http://localhost:5000` or any absolute backend URL in browser code.

## Statelessness (required)
The container's filesystem is wiped on every deploy and many copies may run at once.
So:
- **Data → MongoDB.** **Files → GCS** (`backend/src/Storage/gcs.ts`). See `.ai/data-storage.md`.
- No local-disk writes, no in-memory caches you expect to persist, no local sessions.

## Config & secrets
- The backend reads env **only** through `backend/src/Config/AppConfig.ts`
  (Zod-validated, fails fast on bad config). **Nothing else reads `process.env`.**
- Never hardcode secrets/URIs/keys — they're injected at deploy time.

## Naming & conventions
- Folders are PascalCase (`Controllers/`, `Services/`, …); files are
  `entity.layer.ts` (e.g. `todo.service.ts`). Interfaces are `I<Entity>`; Zod
  schemas end in `Schema`.
- Every layer folder has a barrel `index.ts` — update it when you add files.
- Database name = the app's name (the `APP_NAME` slug). See `.ai/data-storage.md`.
- Deep reference for the backend conventions: `backend/README.md`.
