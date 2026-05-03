/**
 * TypeORM DataSource singleton and factory.
 *
 * The DataSource is created once and shared across the application.
 * Modules register their entities dynamically via `addEntities()`.
 *
 * The migration path is relative to the project root — TypeORM resolves
 * it at runtime.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../../config/database.js';
import type { DataSourceOptions } from 'typeorm';

let dataSource: DataSource | null = null;

const dataSourceOptions: DataSourceOptions = {
  ...getDatabaseConfig(),
  entities: [
    // Shared infrastructure entities
    'src/infrastructure/typeorm/entities/**/*.ts',
    // Module-specific entities (each module owns its TypeORM entity)
    'src/modules/*/infrastructure/typeorm/**/*.ts',
  ],
  migrations: ['src/infrastructure/typeorm/migrations/**/*.ts'],
};

/**
 * TypeORM CLI entrypoint.
 *
 * The CLI expects a DataSource instance as the default export. Because this
 * project runs TypeScript directly with tsx, invoke the CLI through the
 * `npm run typeorm -- ...` script so Node resolves .js-style TS imports.
 */
const cliDataSource = new DataSource(dataSourceOptions);

export default cliDataSource;

/**
 * Create and return the singleton TypeORM DataSource.
 * On first call, initializes the connection. Subsequent calls return
 * the existing instance if it is initialized.
 */
export async function createDataSource(): Promise<DataSource> {
  if (dataSource?.isInitialized) {
    return dataSource;
  }

  dataSource = cliDataSource;
  await dataSource.initialize();
  return dataSource;
}

/**
 * Get the existing DataSource instance without initializing.
 * Throws if not yet initialized — use `createDataSource()` first.
 */
export function getDataSource(): DataSource {
  if (!dataSource?.isInitialized) {
    throw new Error(
      'DataSource not initialized. Call createDataSource() first.',
    );
  }
  return dataSource;
}

/**
 * Close the DataSource connection and reset the singleton.
 * Useful for graceful shutdown and test teardown.
 */
export async function closeDataSource(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  dataSource = null;
}
