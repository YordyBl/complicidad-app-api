/**
 * Database configuration — resolves env vars into TypeORM DataSource options.
 *
 * This module is purely configuration. The actual DataSource instance
 * is created in `src/infrastructure/typeorm/datasource.ts`.
 */
import { env } from './env.js';
import type { DataSourceOptions } from 'typeorm';

/**
 * Resolved database configuration from environment variables.
 * Used by the DataSource factory to connect to PostgreSQL.
 */
export function getDatabaseConfig(): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    username: env.db.user,
    password: env.db.password,
    synchronize: env.db.synchronize,
    // Entities and migrations are registered in datasource.ts
    // so they can be added modularly.
    entities: [],
    migrations: [],
  };
}
