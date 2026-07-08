import dotenv from 'dotenv';
import { z } from 'zod';

import RateLimiter from './rateLimiter.js';

dotenv.config();

/**
 * Validate and coerce environment variables ONCE at startup. Failing fast here
 * (with a readable message) is far better than discovering a missing/invalid
 * variable deep inside a request later on.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Port the backend listens on. Inside the container the entrypoint injects
  // BACKEND_PORT (the private loopback port); locally PORT is used. BACKEND_PORT
  // wins when both are set. Default 5000 matches the container's private port.
  PORT: z.coerce.number().int().positive().default(5000),
  BACKEND_PORT: z.coerce.number().int().positive().optional(),

  // Interface to bind. The container sets HOST=127.0.0.1 so the backend is only
  // reachable from the Next.js proxy inside the same container — never public.
  HOST: z.string().default('0.0.0.0'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  // Each app uses its OWN database named after the app. The platform injects
  // APP_NAME at deploy time; mongoose.connect uses it as `dbName`, so the app
  // never silently lands in the shared "test" database. Lowercase slug.
  APP_NAME: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'APP_NAME must be a lowercase slug (a-z, 0-9, hyphens)')
    .default('app'),

  // Comma-separated list of allowed CORS origins; "*" allows all. In production
  // the browser only calls same-origin /api/* through the proxy, so this can be
  // locked down — it exists mainly for local cross-origin dev.
  CORS_ORIGIN: z.string().default('*'),

  // Google Cloud Storage — where uploaded files go (never local disk). Optional:
  // only required when the app actually stores files. On Cloud Run the client
  // uses the runtime service account (ADC); no key file is read from code.
  GCS_BUCKET: z.string().optional(),
  GCS_PROJECT_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`❌ Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;

/** Frozen, fully-typed application configuration. Nothing else reads process.env. */
const AppConfig = Object.freeze({
  NODE_ENV: env.NODE_ENV,
  IS_PRODUCTION: env.NODE_ENV === 'production',
  // BACKEND_PORT (the container's private port) takes precedence over PORT.
  PORT: env.BACKEND_PORT ?? env.PORT,
  HOST: env.HOST,
  MONGO_URI: env.MONGO_URI,
  // The per-app database name. Used as mongoose's `dbName`.
  DB_NAME: env.APP_NAME,
  APP_NAME: env.APP_NAME,
  CORS_ORIGIN: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  GCS_BUCKET: env.GCS_BUCKET,
  GCS_PROJECT_ID: env.GCS_PROJECT_ID,
  RateLimiter,
});

export type AppConfigType = typeof AppConfig;

export default AppConfig;
