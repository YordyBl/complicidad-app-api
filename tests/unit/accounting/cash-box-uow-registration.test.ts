/**
 * Unit tests for CashBox registration in datasource and UnitOfWork.
 *
 * Verifies the infrastructure wiring:
 * - CashBoxEntity is registered in the DataSource entities list
 * - TypeOrmUnitOfWorkScope exposes a cashBoxes repository
 */
import { describe, it, expect, vi } from 'vitest';

describe('UnitOfWork CashBox registration', () => {
  describe('TypeOrmUnitOfWorkScope', () => {
    it('exposes a cashBoxes repository', async () => {
      // Dynamically import to avoid TypeORM decorator resolution in unit tests
      const mod = await import(
        '../../../src/infrastructure/typeorm/unit-of-work.js'
      );
      const { TypeOrmUnitOfWorkScope } = mod;

      const mockRepo = {};
      const mockGetRepository = vi.fn(() => mockRepo);
      const mockManager = { getRepository: mockGetRepository };

      const scope = new TypeOrmUnitOfWorkScope(mockManager as never);

      expect(scope.cashBoxes).toBeDefined();
      // Should be an instance of CashBoxTypeOrmRepository
      expect(typeof scope.cashBoxes.save).toBe('function');
      expect(typeof scope.cashBoxes.findByBusinessDate).toBe('function');
      expect(typeof scope.cashBoxes.findCurrent).toBe('function');
      expect(typeof scope.cashBoxes.findById).toBe('function');
      expect(typeof scope.cashBoxes.findAllOrdered).toBe('function');
      expect(typeof scope.cashBoxes.findLastClosed).toBe('function');
    });
  });

  describe('datasource entity registration', () => {
    it('includes CashBoxEntity in the entities array', async () => {
      const mod = await import(
        '../../../src/infrastructure/typeorm/datasource.js'
      );
      // Access the DataSource options through the cliDataSource
      const { default: cliDataSource } = mod as { default: { options: { entities: unknown[] } } };

      const entityNames = cliDataSource.options.entities.map(
        (e: unknown) => (e as { name?: string }).name ?? String(e),
      );

      expect(entityNames.some((name: string) => name.includes('CashBoxEntity'))).toBe(true);
    });
  });
});
