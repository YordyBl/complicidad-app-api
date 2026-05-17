/**
 * Integration tests for TypeORM-backed UnitOfWork transaction boundaries.
 *
 * These tests require a running PostgreSQL instance configured via
 * environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 *
 * If DB_HOST is not set, all tests in this file are skipped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDataSource,
  closeDataSource,
  TypeOrmUnitOfWork,
  TypeOrmUnitOfWorkScope,
} from '../../../src/infrastructure/typeorm/index.js';
import type { UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';

const hasDatabase = Boolean(process.env.DB_HOST);

type QueryRow = Record<string, unknown>;

describe('TypeORM DataSource connection', () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    await createDataSource();
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    await closeDataSource();
  });

  it.runIf(hasDatabase)(
    'should initialize and connect to PostgreSQL',
    () => {
      // If we got here without throwing, connection succeeded
      expect(true).toBe(true);
    },
  );

  it.runIf(hasDatabase)(
    'should run a raw query to verify connectivity',
    async () => {
      const { getDataSource } = await import(
        '../../../src/infrastructure/typeorm/datasource.js'
      );
      const ds = getDataSource();
      const result: QueryRow[] = await ds.query('SELECT 1 AS value');
      expect(result).toBeDefined();
      expect(result[0]?.value).toBe(1);
    },
  );
});

describe('TypeORM UnitOfWork transaction boundaries', () => {
  let uow: TypeOrmUnitOfWork;

  beforeAll(async () => {
    if (!hasDatabase) return;
    await createDataSource();
    const { getDataSource } = await import(
      '../../../src/infrastructure/typeorm/datasource.js'
    );
    uow = new TypeOrmUnitOfWork(getDataSource());
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    await closeDataSource();
  });

  it.runIf(hasDatabase)(
    'should commit when the callback succeeds',
    async () => {
      const result = await uow.run(
        (_scope: UnitOfWorkScope) => Promise.resolve('committed' as const),
      );
      expect(result).toBe('committed');
    },
  );

  it.runIf(hasDatabase)(
    'should roll back and re-throw when the callback throws',
    async () => {
      const testError = new Error('Simulated transaction failure');

      await expect(
        uow.run(
          (_scope: UnitOfWorkScope) =>
            Promise.reject(testError),
        ),
      ).rejects.toThrow('Simulated transaction failure');
    },
  );

  it.runIf(hasDatabase)(
    'should isolate committed data from rolled-back data',
    async () => {
      const { getDataSource } = await import(
        '../../../src/infrastructure/typeorm/datasource.js'
      );
      const ds = getDataSource();

      // Clean up any previous test_counter table
      await ds.query('DROP TABLE IF EXISTS test_counter');
      await ds.query(
        'CREATE TABLE test_counter (id INT PRIMARY KEY, val INT NOT NULL)',
      );

      try {
        // Successful transaction inserts 1 row using the transactional scope
        await uow.run(
          async (scope: UnitOfWorkScope) => {
            const s = scope as TypeOrmUnitOfWorkScope;
            await s.query(
              'INSERT INTO test_counter (id, val) VALUES (1, 100)',
            );
          },
        );

        // Failed transaction tries to insert another row but rolls back
        await expect(
          uow.run(
            async (scope: UnitOfWorkScope) => {
              const s = scope as TypeOrmUnitOfWorkScope;
              await s.query(
                'INSERT INTO test_counter (id, val) VALUES (2, 200)',
              );
              throw new Error('rollback');
            },
          ),
        ).rejects.toThrow('rollback');

        // Verify only the committed row exists after rollback
        const rows: QueryRow[] = await ds.query(
          'SELECT id, val FROM test_counter ORDER BY id',
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).toBe(1);
        expect(rows[0]?.val).toBe(100);
      } finally {
        await ds.query('DROP TABLE IF EXISTS test_counter');
      }
    },
  );
});
