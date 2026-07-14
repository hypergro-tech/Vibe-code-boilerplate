# Architecture — the layered backend, DI, and how to add a resource

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
Repository   backend/src/Repository/data/**  the ONLY layer that talks to Mongoose
   │
Model        backend/src/Models/**           Mongoose schema + TypeScript interface
```

Controllers, Services, and Repositories are **classes wired together by a
Dependency-Injection container** (`backend/src/DI/`) — see below.

Supporting pieces: `Middlewares/` (asyncHandler, validate, errorHandler),
`Utils/ApiResponse.ts` (`sendSuccess`), `Utils/errors/AppError.ts` (error classes),
`Config/` (AppConfig, db, logger, rateLimiter, openapi),
`Repository/external/` (third-party integrations, e.g. the GCS helper).

## Rules of the layers
- **Only the Repository touches Mongoose.** Services call repositories; controllers call services.
- **Services never see `req`/`res`** — they take/return plain data, so they're testable and reusable.
- **Reuse the base classes.** `Repository/data/crud.repository.ts` and `Services/crud.service.ts`
  give you `create/findAll/findById/update/destroy` for free. Extend them and override
  only what differs (call `super`).
- **Throw, don't return nulls.** Throw `AppError` subclasses (`NotFoundError`,
  `ConflictError`, `BadRequestError`, …); the central error handler formats them.
- **Respond via `sendSuccess`** so every endpoint returns `{ success, message, data, meta? }`.

## Dependency Injection — the container (`backend/src/DI/`)
Layers do **not** `new` each other. Every controller / service / repository is
registered once in `backend/src/DI/index.ts`, and the container builds the
object graph and injects each dependency where it's declared. This is the same
pattern (Awilix) used in Hypergro's main `hypergro-service` backend.

**How a class declares what it needs** — it destructures the dependency by name
from the container "cradle" in its constructor, typed against `Cradle`:

```ts
// Service: receives its repository
constructor({ resourceRepository }: Pick<Cradle, 'resourceRepository'>) {
  super(resourceRepository);
}

// Controller: receives its service
constructor({ resourceService }: Pick<Cradle, 'resourceService'>) {
  this.resourceService = resourceService;
}
```

**How routes get a controller** — they pull the built instance from the container
instead of importing a singleton or calling `new`:

```ts
import container from '../../DI/index.js';
const resource = container.cradle.resourceController;
router.route('/').get(validate(listResourceSchema), asyncHandler(resource.listResources));
```

**The name is the contract.** The key you register (`resourceService`) must match
the property name a constructor destructures (`{ resourceService }`). Controllers'
handler methods are **arrow functions** so `this` stays bound when passed as route
callbacks.

> **You don't have to over-use DI.** Pure helpers, config, and stateless utility
> functions don't need to be registered — import them normally. DI is for the
> layered chain (controller → service → repository) and anything that benefits
> from being swapped in tests (e.g. a third-party client under `Repository/external/`).

## Where third-party integrations go — `Repository/external/`
The Repository layer holds **all outward data access**, split by kind:
- `Repository/data/` — our own database (Mongoose) repositories.
- `Repository/external/` — third-party integrations (APIs, storage, mail, …).

The one shipped example is **`Repository/external/gcs.ts`** (Google Cloud
Storage). It shows the shape every third-party wrapper should follow: read config
from `AppConfig` (never hardcode secrets), wrap the vendor SDK, and expose a few
plain methods. When your app needs another integration (a mailer, a payment API,
an internal service call…), add it **here under `Repository/external/`** —
**never** create a new top-level folder for it. Most apps won't need any of these;
add one only when your feature actually calls for it.

## 🚫 Folder discipline — do NOT add new top-level folders
These backend layer folders are **fixed**. Everything you build nests **inside**
them; you should essentially never add a new folder directly under `backend/src/`:

```
backend/src/
├── DI/           DI wiring (register new resources here)
├── Config/       env (AppConfig), db, logger, rate limiter, openapi
├── Controllers/  HTTP adapter classes
├── Services/     business logic classes
├── Repository/   data access — data/ (Mongoose) + external/ (third-party)
├── Models/       Mongoose schemas + interfaces
├── Validators/   Zod request schemas
├── Middlewares/  asyncHandler, validate, errorHandler
├── Routes/       /api → /v1 → feature routers
└── Utils/        ApiResponse, AppError hierarchy
```

A new feature = new `entity.*` files **inside** the existing layers (see the
recipe below), not a new folder. A new integration = a file under
`Repository/external/`. Keeping the top level small is a hard standard here — it's
how a large codebase stays navigable.

## The copy-me template: the `resource` entity
There is one complete example entity — `resource` — implemented across every layer.
It's there to be copied. Look at these files together:
```
backend/src/Models/resource.model.ts
backend/src/Validators/resource.validator.ts
backend/src/Repository/data/resource.repository.ts
backend/src/Services/resource.service.ts
backend/src/Controllers/resource.controller.ts
backend/src/Routes/v1/resource.routes.ts
```

## Add a new API resource (e.g. `todo`) — the recipe
1. **Copy** the six `resource.*` files → rename to `todo.*` (file names and the
   symbols inside: `IResource`→`ITodo`, `ResourceService`→`TodoService`, etc.).
   Keep repositories in `Repository/data/`.
2. **Adapt** the Model interface + schema, the Zod validators, and any custom
   service logic to your entity's fields.
3. **Register in the DI container** — in `backend/src/DI/index.ts`, add three
   lines to the `Cradle` interface and three to the `register({ … })` block for
   the todo repository/service/controller (mirror the `resource*` lines exactly).
4. **Update the barrels** so the new files are exported — add lines to the
   `index.ts` in `Models/`, `Repository/`, `Services/`, and `Controllers/`
   (mirror how `resource` is exported).
5. **Mount the routes** in `backend/src/Routes/v1/index.ts`:
   `router.use('/todos', todoRoutes);`
6. **Document it** — add one entry to the `resources` array in
   `backend/src/Config/openapi.ts` so it shows up at `/api/docs`.
7. **Check it compiles:** `npm --prefix backend run typecheck`.

Your new endpoints are now live at `/api/v1/todos` (and the browser reaches them
at same-origin `/api/v1/todos` through the proxy). No Next.js API routes needed —
in fact, never create them (see `.ai/master-prompt.md`).
