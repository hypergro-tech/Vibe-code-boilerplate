# Architecture — the layered backend & how to add a resource

The backend (`backend/`) is a clean, layered Express + TypeScript service. Every
feature flows through the same layers, each with ONE job:

```
HTTP request
   │
   ▼
Route        backend/src/Routes/**          wires URL + method → validator + controller
   │
Validator    backend/src/Validators/**      Zod schemas; validates/coerces body|params|query
   │
Controller   backend/src/Controllers/**     thin: reads validated input, calls a service, sends response
   │
Service      backend/src/Services/**         business logic; framework-agnostic (never sees req/res)
   │
Repository   backend/src/Repository/**       the ONLY layer that talks to Mongoose
   │
Model        backend/src/Models/**           Mongoose schema + TypeScript interface
```

Supporting pieces: `Middlewares/` (asyncHandler, validate, errorHandler),
`Utils/ApiResponse.ts` (`sendSuccess`), `Utils/errors/AppError.ts` (error classes),
`Config/` (AppConfig, db, logger, rateLimiter, openapi), `Storage/` (GCS helper).

## Rules of the layers
- **Only the Repository touches Mongoose.** Services call repositories; controllers call services.
- **Services never see `req`/`res`** — they take/return plain data, so they're testable and reusable.
- **Reuse the base classes.** `Repository/crud.repository.ts` and `Services/crud.service.ts`
  give you `create/findAll/findById/update/destroy` for free. Extend them and override
  only what differs (call `super`).
- **Throw, don't return nulls.** Throw `AppError` subclasses (`NotFoundError`,
  `ConflictError`, `BadRequestError`, …); the central error handler formats them.
- **Respond via `sendSuccess`** so every endpoint returns `{ success, message, data, meta? }`.

## The copy-me template: the `resource` entity
There is one complete example entity — `resource` — implemented across every layer.
It's there to be copied. Look at these six files together:
```
backend/src/Models/resource.model.ts
backend/src/Validators/resource.validator.ts
backend/src/Repository/resource.repository.ts
backend/src/Services/resource.service.ts
backend/src/Controllers/resource.controller.ts
backend/src/Routes/v1/resource.routes.ts
```

## Add a new API resource (e.g. `todo`) — the recipe
1. **Copy** the six `resource.*` files → rename to `todo.*` (file names and the
   symbols inside: `IResource`→`ITodo`, `ResourceService`→`TodoService`, etc.).
2. **Adapt** the Model interface + schema, the Zod validators, and any custom
   service logic to your entity's fields.
3. **Update the barrels** so the new files are exported — add lines to the
   `index.ts` in `Models/`, `Repository/`, `Services/`, and `Controllers/`
   (mirror how `resource` is exported).
4. **Mount the routes** in `backend/src/Routes/v1/index.ts`:
   `router.use('/todos', todoRoutes);`
5. **Document it** — add one entry to the `resources` array in
   `backend/src/Config/openapi.ts` so it shows up at `/api/docs`.
6. **Check it compiles:** `npm --prefix backend run typecheck`.

Your new endpoints are now live at `/api/v1/todos` (and the browser reaches them
at same-origin `/api/v1/todos` through the proxy). No Next.js API routes needed —
in fact, never create them (see `.ai/master-prompt.md`).
