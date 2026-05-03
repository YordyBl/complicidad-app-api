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

/**
 * Scoped repository container bound to the active transaction.
 *
 * Modules add their repositories here as they are implemented.
 * The type assertion in use cases (e.g. `scope as PurchaseScope`)
 * provides type safety at the call site without coupling the
 * generic scope to specific modules.
 */
export class TypeOrmUnitOfWorkScope implements UnitOfWorkScope {
  constructor(protected readonly manager: EntityManager) {
    // Future: inject scoped repositories here
    // this.products = new TypeOrmProductRepository(manager);
    // this.inventoryLots = new TypeOrmInventoryLotRepository(manager);
    // this.purchases = new TypeOrmPurchaseRepository(manager);
    // this.cashLedger = new TypeOrmCashLedgerRepository(manager);
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
