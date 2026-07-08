# Data & storage — MongoDB and GCS (never local disk)

Containers here are **stateless**: the filesystem is erased on every deploy and
several copies can run at once. Anything you want to keep must go to MongoDB (data)
or Google Cloud Storage (files). Never the local disk.

## Structured data → MongoDB
- Go through the **Repository layer** (Mongoose) — see `.ai/architecture.md`.
- **Each app uses its OWN database, named after the app.** The platform injects an
  `APP_NAME` env var (a lowercase slug); the backend passes it to Mongoose as
  `dbName` in `backend/src/Config/db.ts`. So many apps share one cluster without
  colliding.
- **Never hardcode a database name**, and never put a db path in `MONGO_URI` — the
  name always comes from `APP_NAME`.
- The connection string comes from env via `AppConfig` — never hardcode it.

## Files & uploads → Google Cloud Storage
- Use the helper: **`backend/src/Storage/gcs.ts`** (`uploadObject`,
  `getSignedReadUrl`, `deleteObject`). It authenticates automatically on Cloud Run
  (the runtime service account) — no key files in code.
- Receive uploads with **multer `memoryStorage`** (a `Buffer` in memory), then hand
  the buffer to `uploadObject`. Example:
  ```ts
  import multer from 'multer';
  import { uploadObject } from '../Storage/index.js';
  const upload = multer({ storage: multer.memoryStorage() });

  router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
    const { url, key } = await uploadObject({
      buffer: req.file!.buffer,
      destination: `uploads/${Date.now()}-${req.file!.originalname}`,
      contentType: req.file!.mimetype,
    });
    sendSuccess(res, { data: { url, key } });
  }));
  ```
- The bucket name comes from `GCS_BUCKET` (env, via `AppConfig`).

## ❌ Never do these (they break statelessness)
- `fs.writeFile` / `fs.appendFile` to store user data or uploads
- `multer.diskStorage` or writing to an `uploads/` folder
- SQLite, LowDB, or any file-on-disk database
- Long-lived in-memory state you expect to survive (use MongoDB)
- Temp files you read back later (a different container copy won't have them)
