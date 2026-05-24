/**
 * TypeORM DataSource singleton and factory.
 *
 * The DataSource is created once and shared across the application.
 * Entity classes are imported directly (not via glob patterns) so that
 * vitest's module transformation pipeline handles them correctly.
 *
 * The migration path is relative to the project root — TypeORM resolves
 * it at runtime.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../../config/database.js';
import type { DataSourceOptions } from 'typeorm';

// ── Entity imports ────────────────────────────────────────────
// Direct class references so vitest transpiles TypeScript decorators.
import { ProductEntity } from '../../modules/inventory/infrastructure/typeorm/ProductEntity.js';
import { VariantEntity } from '../../modules/inventory/infrastructure/typeorm/VariantEntity.js';
import { InventoryLotEntity } from '../../modules/inventory/infrastructure/typeorm/InventoryLotEntity.js';
import { PurchaseEntity } from '../../modules/inventory/infrastructure/typeorm/PurchaseEntity.js';
import { SupplierEntity } from '../../modules/inventory/infrastructure/typeorm/SupplierEntity.js';
import { CustomerEntity } from '../../modules/customers/infrastructure/typeorm/CustomerEntity.js';
import { SaleEntity } from '../../modules/sales-returns/infrastructure/typeorm/SaleEntity.js';
import { SaleLineEntity } from '../../modules/sales-returns/infrastructure/typeorm/SaleLineEntity.js';
import { LotConsumptionRecordEntity } from '../../modules/sales-returns/infrastructure/typeorm/LotConsumptionRecordEntity.js';
import { CashBoxEntity } from '../../modules/accounting-reports/infrastructure/typeorm/CashBoxEntity.js';
import { CashClosingEntity } from '../../modules/accounting-reports/infrastructure/typeorm/CashClosingEntity.js';
import { CashLedgerEntryEntity } from '../../modules/accounting-reports/infrastructure/typeorm/CashLedgerEntryEntity.js';
import { UserEntity } from '../../modules/auth-users/infrastructure/typeorm/UserEntity.js';
import { InventoryLotAdjustmentEntity } from '../../modules/inventory/infrastructure/typeorm/InventoryLotAdjustmentEntity.js';
import { SaleConstanciaEmissionEntity } from '../../modules/sales-returns/infrastructure/typeorm/SaleConstanciaEmissionEntity.js';

let dataSource: DataSource | null = null;

const dataSourceOptions: DataSourceOptions = {
  ...getDatabaseConfig(),
  entities: [
    ProductEntity,
    VariantEntity,
    InventoryLotEntity,
    PurchaseEntity,
    SupplierEntity,
    CustomerEntity,
    SaleEntity,
    SaleLineEntity,
    LotConsumptionRecordEntity,
    CashBoxEntity,
    CashClosingEntity,
    CashLedgerEntryEntity,
    UserEntity,
    InventoryLotAdjustmentEntity,
    SaleConstanciaEmissionEntity,
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
