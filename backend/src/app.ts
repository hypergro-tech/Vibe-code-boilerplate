import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';

import ApiRoutes from './Routes/index.js';
import AppConfig from './Config/AppConfig.js';
import { errorHandler, notFoundHandler } from './Middlewares/index.js';
import { openApiDocument } from './Config/openapi.js';

/**
 * A minimal Swagger UI page served at /api/docs. We DON'T use swagger-ui-express's
 * default handler because it redirects /api/docs → /api/docs/ for relative assets,
 * and that redirect loops behind the Next.js proxy (the proxy's :path* drops the
 * trailing slash). This page uses ABSOLUTE asset + spec URLs, so it works at
 * /api/docs with no redirect and no trailing-slash dependency.
 */
const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Docs</title>
  <link rel="stylesheet" href="/api/docs-assets/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs-assets/swagger-ui-bundle.js"></script>
  <script src="/api/docs-assets/swagger-ui-standalone-preset.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
    });
  </script>
</body>
</html>`;

/**
 * Builds and configures the Express application WITHOUT starting it. Separating
 * the app from the server (which listens) keeps the app importable in tests and
 * lets the bootstrap (index.ts) own process concerns like DB connection and
 * graceful shutdown.
 */
const createApp = (): Express => {
  const app = express();

  // Behind the Next.js proxy + Cloud Run, trust the first proxy hop so req.ip is
  // the real client and express-rate-limit keys correctly (v7 throws otherwise).
  app.set('trust proxy', 1);

  // Self-documenting API, generated from the Zod validators. Mounted BEFORE
  // helmet so its CSP doesn't block the Swagger UI's inline init script.
  // The raw OpenAPI spec.
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  // Swagger UI static assets (css/js) at an absolute, slash-independent path.
  app.use(
    '/api/docs-assets',
    swaggerUi.serveFiles(openApiDocument as unknown as Parameters<typeof swaggerUi.serveFiles>[0])
  );
  // The docs page itself — 200, no redirect (see DOCS_HTML above).
  app.get('/api/docs', (_req, res) => {
    res.type('html').send(DOCS_HTML);
  });

  // Security & performance middleware (ordering matters).
  app.use(helmet());
  app.use(cors({ origin: AppConfig.CORS_ORIGIN }));
  app.use(compression());

  // Body parsers.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging — concise in production, verbose in development.
  app.use(morgan(AppConfig.IS_PRODUCTION ? 'combined' : 'dev'));

  // Health probes — kept ABOVE the rate limiter so orchestrators are never
  // throttled, and outside /api.
  // Liveness: the process is up and serving.
  app.get('/health', (_req, res) => {
    res.json({ success: true, message: 'OK', data: { uptime: process.uptime() } });
  });
  // Readiness: up AND the database is connected. Cloud Run gates traffic on this.
  app.get('/health/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({
      success: ready,
      message: ready ? 'ready' : 'not ready',
      data: { db: ready ? 'up' : 'down' },
    });
  });

  // Global rate limiter.
  AppConfig.RateLimiter(app);

  // Application routes.
  app.use('/api', ApiRoutes);

  // 404 + centralised error handling (must be registered last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
