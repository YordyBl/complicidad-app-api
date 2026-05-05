import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variable de entorno requerida faltante: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const env = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isTest: () => env.nodeEnv === 'test',
  isDev: () => env.nodeEnv === 'development',
  isProd: () => env.nodeEnv === 'production',
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: '5d' as const,
  },
  db: {
    host: optional('DB_HOST', 'localhost'),
    port: parseInt(optional('DB_PORT', '5432'), 10),
    name: optional('DB_NAME', 'complicidad'),
    user: optional('DB_USER', 'complicidad'),
    password: optional('DB_PASSWORD', ''),
    synchronize: optional('DB_SYNC', 'false') === 'true',
  },
  cors: {
    /**
     * Comma-separated list of allowed origins.
     * In development: "http://localhost:3001"
     * In production: set via env var, never use wildcard.
     * Docker server-to-server calls bypass CORS (same-network).
     */
    origins: optional('CORS_ORIGINS', 'http://localhost:3001')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** Allowed HTTP methods for preflight. */
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as const,
    /** Allowed request headers. */
    allowedHeaders: ['Content-Type', 'Authorization'] as const,
  },
} as const;

export type Env = typeof env;
