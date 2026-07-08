# Master prompt — the rules you must never break

You are building inside the **Hypergro deploy boilerplate**. This project is
deployed automatically to Cloud Run in a fixed shape. Follow these hard rules so
the app stays clean, standardized, and deployable. **These override any default
habits.** When in doubt, read the matching file in `.ai/`.

1. **Stack is fixed.** Backend = **Express + TypeScript** (the layered structure in
   `backend/`). Frontend = **Next.js + TypeScript** (`frontend/`). Database =
   **MongoDB** only. No other languages, frameworks, or databases. → `.ai/standards.md`

2. **Never write to local disk.** Containers are stateless and wiped on every
   deploy. All data → **MongoDB** (through the Repository layer). All files/uploads
   → **Google Cloud Storage** via `backend/src/Storage/gcs.ts`. Never use
   `fs.writeFile`, `multer.diskStorage`, an `uploads/` folder, SQLite, or temp
   files. → `.ai/data-storage.md`

3. **Never touch the deploy/infra files.** Do **not** edit the `Dockerfile`,
   `server.js`, `frontend/next.config.mjs` (the `/api` proxy), the port/HOST
   bindings, `.dockerignore`, or anything in `scripts/`. → `.ai/deploy.md`

4. **Never hardcode secrets.** No connection strings, keys, or tokens in code.
   The backend reads config **only** through `backend/src/Config/AppConfig.ts`
   (nothing else reads `process.env`). Values are injected at deploy time.

5. **API endpoints are explicit Express routes** under `/api/...`, following
   **Route → Validator → Controller → Service → Repository → Model**. **Never**
   create Next.js API routes, route handlers (`app/api/**`), or server actions for
   data — the backend owns all data. → `.ai/architecture.md`

6. **Each app has its own database, named after the app** (via the `APP_NAME`
   env). Never hardcode a database name. → `.ai/data-storage.md`

7. **The backend is private.** It binds `127.0.0.1:5000` and is never public.
   Only the Next.js frontend is exposed. Don't change the bind or expose it.

8. **The browser only calls same-origin `/api/*`.** Use `frontend/src/lib/api.ts`
   (axios `baseURL:'/api'`). Never call the backend by absolute host/port from the
   browser, and never put secrets in frontend code.

9. **Validate every input with Zod**, respond via `sendSuccess` / `ApiResponse`,
   and throw `AppError` subclasses (`NotFoundError`, `ConflictError`, …) for
   errors. Don't invent new response shapes.

10. **Add a new entity by copying the `resource.*` template** and updating the
    barrels + `Routes/v1/index.ts` + `Config/openapi.ts`, then run
    `npm run typecheck`. → `.ai/architecture.md`
