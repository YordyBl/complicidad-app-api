/**
 * Unit tests for CashLedgerTypeOrmRepository scoped queries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CashLedgerTypeOrmRepository } from '../../../src/modules/accounting-reports/infrastructure/typeorm/CashLedgerTypeOrmRepository.js';
describe('CashLedgerTypeOrmRepository', () => {
  const mockFind = vi.fn();
  const mockFindOne = vi.fn();
  const mockSave = vi.fn();
  const mockGetRepository = vi.fn(() => ({
    findOne: mockFindOne,
    find: mockFind,
    save: mockSave,
  }));
  const mockManager = { getRepository: mockGetRepository };

  let repo: CashLedgerTypeOrmRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new CashLedgerTypeOrmRepository(mockManager as never);
  });

  describe('findByCashBoxId', () => {
    it('returns entries for a given cash box id', async () => {
      mockFind.mockResolvedValue([
        {
          id: 'entry-1',
          type: 'SALE_INCOME',
          amountCents: 5000,
          sourceId: 'sale-1',
          tag: null,
          cashBoxId: 'box-query-1',
          concept: null,
          createdAt: new Date('2026-05-15T12:00:00Z'),
          updatedAt: new Date('2026-05-15T12:00:00Z'),
        },
        {
          id: 'entry-2',
          type: 'MANUAL_ADJUSTMENT',
          amountCents: -200,
          sourceId: 'adj-1',
          tag: null,
          cashBoxId: 'box-query-1',
          concept: 'Corrección',
          createdAt: new Date('2026-05-15T13:00:00Z'),
          updatedAt: new Date('2026-05-15T13:00:00Z'),
        },
      ]);

      const results = await repo.findByCashBoxId('box-query-1');

      expect(results).toHaveLength(2);
      expect(results[0]!.id.toString()).toBe('entry-1');
      expect(results[1]!.id.toString()).toBe('entry-2');
      expect(results[0]!.type).toBe('SALE_INCOME');
      expect(results[1]!.type).toBe('MANUAL_ADJUSTMENT');
      expect(mockFind).toHaveBeenCalledWith({
        where: { cashBoxId: 'box-query-1' },
        order: { createdAt: 'ASC' },
      });
    });

    it('returns empty array when no entries for the cash box', async () => {
      mockFind.mockResolvedValue([]);

      const results = await repo.findByCashBoxId('box-empty');

      expect(results).toEqual([]);
    });

    it('does not return entries from other cash boxes', async () => {
      mockFind.mockImplementation(
        async ({ where: { cashBoxId } }: { where: { cashBoxId: string } }) => {
          if (cashBoxId === 'box-1') {
            return [
              {
                id: 'entry-1',
                type: 'SALE_INCOME',
                amountCents: 1000,
                sourceId: 'sale-1',
                tag: null,
                cashBoxId: 'box-1',
                concept: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];
          }
          return [];
        },
      );

      const results = await repo.findByCashBoxId('box-other');

      expect(results).toEqual([]);
    });
  });
});
