/**
 * Unit tests for GetCashBoxMovementsUseCase.
 *
 * Acceptance criteria:
 * - Returns all entries for a cash box in chronological order
 * - Returns error when cash box not found
 * - Returns empty list when no entries exist
 * - Only returns entries for the requested cash box
 * - Filters entries by from/to date range
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCashBoxMovementsUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetCashBoxMovementsUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';
import { Money } from '../../../src/shared/domain/Money.js';

describe('GetCashBoxMovementsUseCase', () => {
  const mockFindById = vi.fn();
  const mockFindByCashBoxId = vi.fn();

  const mockCashBoxRepo = {
    save: vi.fn(),
    findByBusinessDate: vi.fn(),
    findCurrent: vi.fn(),
    findById: mockFindById,
    findAllOrdered: vi.fn(),
    findLastClosed: vi.fn(),
  };

  const mockCashLedgerRepo = {
    append: vi.fn(),
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findByCashBoxId: mockFindByCashBoxId,
  };

  let useCase: GetCashBoxMovementsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new GetCashBoxMovementsUseCase(mockCashBoxRepo, mockCashLedgerRepo);
  });

  function createBox(id: string): CashBox {
    return new CashBox({
      id: CashBoxId.from(id),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: 5000,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });
  }

  function makeEntry(
    id: string,
    type: 'SALE_INCOME' | 'PURCHASE_OUTFLOW' | 'MANUAL_ADJUSTMENT',
    amountCents: number,
    cashBoxId: string,
  ): CashLedgerEntry {
    return new CashLedgerEntry(
      CashLedgerEntryId.from(id),
      type,
      Money.fromCents(amountCents),
      'source-1',
      null,
      new Date(),
      CashBoxId.from(cashBoxId),
      null,
    );
  }

  describe('execute', () => {
    it('returns all entries for a cash box in order', async () => {
      const box = createBox('box-mov-1');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('e1', 'SALE_INCOME', 5000, 'box-mov-1'),
        makeEntry('e2', 'PURCHASE_OUTFLOW', -2000, 'box-mov-1'),
        makeEntry('e3', 'MANUAL_ADJUSTMENT', 300, 'box-mov-1'),
      ]);

      const result = await useCase.execute({ cashBoxId: 'box-mov-1' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.cashBoxId).toBe('box-mov-1');
      expect(result.value.entries).toHaveLength(3);
      expect(result.value.entries[0]!.id).toBe('e1');
      expect(result.value.entries[1]!.id).toBe('e2');
      expect(result.value.entries[2]!.id).toBe('e3');
    });

    it('returns error when cash box not found', async () => {
      mockFindById.mockResolvedValue(null);

      const result = await useCase.execute({ cashBoxId: 'non-existent' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(mockFindByCashBoxId).not.toHaveBeenCalled();
    });

    it('returns empty entry list when no movements exist', async () => {
      const box = createBox('box-mov-empty');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([]);

      const result = await useCase.execute({ cashBoxId: 'box-mov-empty' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entries).toEqual([]);
    });

    it('includes pagination metadata in the result', async () => {
      const box = createBox('box-mov-paged');
      mockFindById.mockResolvedValue(box);
      const entries = Array.from({ length: 25 }, (_, i) =>
        makeEntry(`e${i + 1}`, 'SALE_INCOME', 1000, 'box-mov-paged'),
      );
      mockFindByCashBoxId.mockResolvedValue(entries);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-paged',
        page: 1,
        pageSize: 10,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entries).toHaveLength(10);
      expect(result.value.total).toBe(25);
      expect(result.value.page).toBe(1);
      expect(result.value.pageSize).toBe(10);
      expect(result.value.totalPages).toBe(3);
    });

    it('returns second page of paginated results', async () => {
      const box = createBox('box-mov-paged2');
      mockFindById.mockResolvedValue(box);
      const entries = Array.from({ length: 25 }, (_, i) =>
        makeEntry(`e${i + 1}`, 'SALE_INCOME', 1000, 'box-mov-paged2'),
      );
      mockFindByCashBoxId.mockResolvedValue(entries);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-paged2',
        page: 2,
        pageSize: 10,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entries).toHaveLength(10);
      expect(result.value.entries[0]!.id).toBe('e11');
    });

    it('filters entries by type', async () => {
      const box = createBox('box-mov-filter');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('e1', 'SALE_INCOME', 5000, 'box-mov-filter'),
        makeEntry('e2', 'PURCHASE_OUTFLOW', -2000, 'box-mov-filter'),
        makeEntry('e3', 'MANUAL_ADJUSTMENT', 300, 'box-mov-filter'),
      ]);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-filter',
        type: 'PURCHASE_OUTFLOW',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0]!.id).toBe('e2');
    });

    it('searches entries by concept', async () => {
      const box = createBox('box-mov-search');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        new CashLedgerEntry(
          CashLedgerEntryId.from('e1'), 'MANUAL_ADJUSTMENT',
          Money.fromCents(1000), 'src', null, new Date(),
          CashBoxId.from('box-mov-search'), 'gasolina',
        ),
        new CashLedgerEntry(
          CashLedgerEntryId.from('e2'), 'MANUAL_ADJUSTMENT',
          Money.fromCents(500), 'src', null, new Date(),
          CashBoxId.from('box-mov-search'), 'pasajes',
        ),
        new CashLedgerEntry(
          CashLedgerEntryId.from('e3'), 'SALE_INCOME',
          Money.fromCents(2000), 'src', null, new Date(),
          CashBoxId.from('box-mov-search'), null,
        ),
      ]);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-search',
        search: 'gas',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0]!.id).toBe('e1');
    });

    it('filters entries from a specific date', async () => {
      const box = createBox('box-mov-from');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        new CashLedgerEntry(
          CashLedgerEntryId.from('e1'), 'SALE_INCOME',
          Money.fromCents(1000), 'src', null, new Date('2026-05-10T08:00:00Z'),
          CashBoxId.from('box-mov-from'), null,
        ),
        new CashLedgerEntry(
          CashLedgerEntryId.from('e2'), 'SALE_INCOME',
          Money.fromCents(2000), 'src', null, new Date('2026-05-12T15:00:00Z'),
          CashBoxId.from('box-mov-from'), null,
        ),
        new CashLedgerEntry(
          CashLedgerEntryId.from('e3'), 'PURCHASE_OUTFLOW',
          Money.fromCents(-500), 'src', null, new Date('2026-05-14T10:00:00Z'),
          CashBoxId.from('box-mov-from'), null,
        ),
      ]);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-from',
        from: '2026-05-12',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // e1 (May 10) excluded; e2 (May 12 15:00 UTC) and e3 (May 14) included
      expect(result.value.entries).toHaveLength(2);
      expect(result.value.entries[0]!.id).toBe('e2');
      expect(result.value.entries[1]!.id).toBe('e3');
    });

    it('filters entries to a specific date', async () => {
      const box = createBox('box-mov-to');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        new CashLedgerEntry(
          CashLedgerEntryId.from('e1'), 'SALE_INCOME',
          Money.fromCents(1000), 'src', null, new Date('2026-05-10T08:00:00Z'),
          CashBoxId.from('box-mov-to'), null,
        ),
        new CashLedgerEntry(
          CashLedgerEntryId.from('e2'), 'SALE_INCOME',
          Money.fromCents(2000), 'src', null, new Date('2026-05-12T15:00:00Z'),
          CashBoxId.from('box-mov-to'), null,
        ),
        new CashLedgerEntry(
          CashLedgerEntryId.from('e3'), 'PURCHASE_OUTFLOW',
          Money.fromCents(-500), 'src', null, new Date('2026-05-14T10:00:00Z'),
          CashBoxId.from('box-mov-to'), null,
        ),
      ]);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-to',
        // to uses midnight UTC; May 12 15:00 > May 13 00:00 → included
        to: '2026-05-13',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // e1 (May 10) and e2 (May 12) included; e3 (May 14) excluded
      expect(result.value.entries).toHaveLength(2);
      expect(result.value.entries[0]!.id).toBe('e1');
      expect(result.value.entries[1]!.id).toBe('e2');
    });

    it('filters entries within a date range', async () => {
      const box = createBox('box-mov-range');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        new CashLedgerEntry(
          CashLedgerEntryId.from('e1'), 'SALE_INCOME',
          Money.fromCents(1000), 'src', null, new Date('2026-05-10T08:00:00Z'),
          CashBoxId.from('box-mov-range'), null,
        ),
        new CashLedgerEntry(
          CashLedgerEntryId.from('e2'), 'SALE_INCOME',
          Money.fromCents(2000), 'src', null, new Date('2026-05-12T15:00:00Z'),
          CashBoxId.from('box-mov-range'), null,
        ),
        new CashLedgerEntry(
          CashLedgerEntryId.from('e3'), 'PURCHASE_OUTFLOW',
          Money.fromCents(-500), 'src', null, new Date('2026-05-14T10:00:00Z'),
          CashBoxId.from('box-mov-range'), null,
        ),
      ]);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-range',
        from: '2026-05-11',
        to: '2026-05-13',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // e1 (May 10) excluded; e2 (May 12) included; e3 (May 14) excluded
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0]!.id).toBe('e2');
    });

    it('returns empty when from date excludes all entries', async () => {
      const box = createBox('box-mov-from-excl');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        new CashLedgerEntry(
          CashLedgerEntryId.from('e1'), 'SALE_INCOME',
          Money.fromCents(1000), 'src', null, new Date('2026-05-10T08:00:00Z'),
          CashBoxId.from('box-mov-from-excl'), null,
        ),
      ]);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-from-excl',
        from: '2026-05-15',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entries).toHaveLength(0);
    });

    it('returns empty when to date excludes all entries', async () => {
      const box = createBox('box-mov-to-excl');
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        new CashLedgerEntry(
          CashLedgerEntryId.from('e1'), 'SALE_INCOME',
          Money.fromCents(1000), 'src', null, new Date('2026-05-14T08:00:00Z'),
          CashBoxId.from('box-mov-to-excl'), null,
        ),
      ]);

      const result = await useCase.execute({
        cashBoxId: 'box-mov-to-excl',
        to: '2026-05-10',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entries).toHaveLength(0);
    });

    it('defaults to page 1 and pageSize total when no pagination params', async () => {
      const box = createBox('box-mov-default');
      mockFindById.mockResolvedValue(box);
      const entries = Array.from({ length: 5 }, (_, i) =>
        makeEntry(`e${i + 1}`, 'SALE_INCOME', 1000, 'box-mov-default'),
      );
      mockFindByCashBoxId.mockResolvedValue(entries);

      const result = await useCase.execute({ cashBoxId: 'box-mov-default' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entries).toHaveLength(5);
      expect(result.value.total).toBe(5);
      expect(result.value.page).toBe(1);
      expect(result.value.pageSize).toBe(5);
      expect(result.value.totalPages).toBe(1);
    });
  });
});
