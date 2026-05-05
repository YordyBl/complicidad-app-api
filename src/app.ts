import express, { type Express, json, type Router } from 'express';
import { requestLogger, errorMiddleware } from './infrastructure/http/index.js';
import { env } from './config/env.js';

export const API_PREFIX = '/api/v1';

// ── CORS middleware ──────────────────────────────────────────────────
// Lightweight CORS handling — no external dependency needed.
// Allowed origins are env-driven; never wildcard in production.

function corsMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const origin = req.headers.origin;

  // Allow requests with no Origin header (server-to-server, tools)
  if (!origin) {
    next();
    return;
  }

  // Check against configured allowed origins
  const isAllowed = env.cors.origins.includes(origin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', env.cors.methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', env.cors.allowedHeaders.join(', '));
    // Credentials not needed for current registration/login without cookies
    // If future direct browser auth requires cookies, set to 'true'
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    if (isAllowed) {
      res.status(204).end();
    } else {
      res.status(403).json({ error: 'CORS', message: 'Origen no permitido' });
    }
    return;
  }

  if (!isAllowed && env.isProd()) {
    // In production, reject disallowed cross-origin requests with a body
    res.status(403).json({ error: 'CORS', message: 'Origen no permitido' });
    return;
  }

  // In dev, silently proceed (browsers will handle CORS errors client-side)
  next();
}

/**
 * Creates and configures the Express application.
 * Middleware and route mounting happen here.
 * The server.ts file calls this and starts listening.
 *
  * @param routers - Optional Express routers to mount under the API prefix.
 */
export function createApp(...routers: Router[]): Express {
  const app = express();

  // --- Global middleware ---
  app.use(corsMiddleware);
  app.use(json());
  app.use(requestLogger);

  // --- Health check (no auth) ---
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // --- Module routes ---
  for (const router of routers) {
    app.use(API_PREFIX, router);
  }

  // --- Error handling (must be last) ---
  app.use(errorMiddleware);

  return app;
}
