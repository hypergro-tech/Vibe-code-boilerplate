# backend/ — Express + TypeScript API (layered + DI)

You're in the backend. It's a layered service:
**Route → Validator(Zod) → Controller → Service → Repository → Model(Mongoose)**,
with the class layers (Controller/Service/Repository) wired through a
**Dependency-Injection container** (`src/DI/`) — they receive their
dependencies, they never `new` each other.

- **Add an API resource:** copy the `resource.*` files, **register them in the DI
  container** (`src/DI/index.ts`), update the barrels, mount in
  `src/Routes/v1/index.ts`, and register in `src/Config/openapi.ts`. Full recipe:
  [`../.ai/architecture.md`](../.ai/architecture.md).
- **Keep the fixed layer folders.** Never add a new top-level folder under
  `src/`. New features nest inside the existing layers; a new third-party
  integration goes under `src/Repository/external/` (see the `gcs.ts` example).
- **Only the Repository touches Mongoose.** Services never see `req`/`res`. Reuse the
  base `Repository/data/crud.repository.ts` / `Services/crud.service.ts` and override
  only what differs.
- **Data → MongoDB, files → GCS** (`src/Repository/external/gcs.ts`). Never write to
  local disk. [`../.ai/data-storage.md`](../.ai/data-storage.md).
- **Config only via `src/Config/AppConfig.ts`** — nothing else reads `process.env`.
  Never hardcode secrets.
- **Validate with Zod**, respond via `sendSuccess`, throw `AppError` subclasses.
- **Never change the port/HOST bind** — the backend must stay private on
  `127.0.0.1:5000`. [`../.ai/deploy.md`](../.ai/deploy.md).
- Deep reference: [`README.md`](README.md).

Check your work: `npm run typecheck`.
