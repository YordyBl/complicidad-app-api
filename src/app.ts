import express, { type Express, json, type Router } from 'express';
import { requestLogger, errorMiddleware } from './infrastructure/http/index.js';

export const API_PREFIX = '/api/v1';

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
