/**
 * TypeORM-backed UnitOfWork adapter.
 *
 * Implements the UnitOfWork port from `src/shared/application/UnitOfWork.ts`
 * using TypeORM QueryRunner for transaction management.
 *
 * Each call to `run()` creates a new QueryRunner, starts a transaction,
 * provides a scoped repository access object, and commits or rolls back.
 */
import { DataSource, EntityManager } from 'typeorm';
import type { UnitOfWork, UnitOfWorkScope } from '../../shared/application/UnitOfWork.js';
import { SaleTypeOrmRepository } from '../../modules/sales-returns/infrastructure/typeorm/SaleTypeOrmRepository.js';
import { InventoryLotTypeOrmRepository } from '../../modules/inventory/infrastructure/typeorm/InventoryLotTypeOrmRepository.js';
import { CashBoxTypeOrmRepository } from '../../modules/accounting-reports/infrastructure/typeorm/CashBoxTypeOrmRepository.js';
import { CashLedgerTypeOrmRepository } from '../../modules/accounting-reports/infrastructure/typeorm/CashLedgerTypeOrmRepository.js';
import { PurchaseTypeOrmRepository } from '../../modules/inventory/infrastructure/typeorm/PurchaseTypeOrmRepository.js';

/**
 * Scoped repository container bound to the active transaction.
 *
 * Every repository here shares the same EntityManager — all operations
 * participate in the same database transaction.
 *
 * The type assertion in use cases (e.g. `scope as SaleScope`)
 * provides type safety at the call site. Keep this class as a flat
 * bag of instantiated repos; do NOT couple it to module-specific
 * interfaces directly.
 */
export class TypeOrmUnitOfWorkScope implements UnitOfWorkScope {
  readonly sales: SaleTypeOrmRepository;
  readonly inventoryLots: InventoryLotTypeOrmRepository;
  readonly cashLedger: CashLedgerTypeOrmRepository;
  readonly purchases: PurchaseTypeOrmRepository;
  readonly cashBoxes: CashBoxTypeOrmRepository;

  constructor(protected readonly manager: EntityManager) {
    this.sales = new SaleTypeOrmRepository(manager);
    this.inventoryLots = new InventoryLotTypeOrmRepository(manager);
    this.cashLedger = new CashLedgerTypeOrmRepository(manager);
    this.purchases = new PurchaseTypeOrmRepository(manager);
    this.cashBoxes = new CashBoxTypeOrmRepository(manager);
  }

  /**
   * Execute a raw SQL query using the transactional EntityManager.
   * All operations performed through this method participate in the
   * UnitOfWork's transaction (commit/rollback).
   */
  async query<T = unknown>(sql: string, parameters?: unknown[]): Promise<T> {
    return this.manager.query(sql, parameters);
  }
}

/**
 * TypeORM-backed UnitOfWork.
 *
 * Usage:
 * ```ts
 * const uow = new TypeOrmUnitOfWork(dataSource);
 * const result = await uow.run(async (scope) => {
 *   const s = scope as PurchaseScope;
 *   await s.inventoryLots.save(lot);
 * });
 * ```
 */
export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const scope = new TypeOrmUnitOfWorkScope(queryRunner.manager);
      const result = await fn(scope);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
