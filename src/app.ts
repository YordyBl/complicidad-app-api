import express, { type Express, json, type Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
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

  // --- Swagger / OpenAPI docs ---
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Complicidad API',
        version: '1.0.0',
        description: 'Internal REST API for auditable employees, inventory, sales, customers, cash, and reports',
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Local development' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    apis: ['./src/**/*routes.ts'],
  };
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });

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
