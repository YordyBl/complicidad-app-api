/**
 * Unit tests for GetCashBoxMovementsUseCase.
 *
 * Acceptance criteria:
 * - Returns all entries for a cash box in chronological order
 * - Returns error when cash box not found
 * - Returns empty list when no entries exist
 * - Only returns entries for the requested cash box
 * - Filters entries by from/to date range
 * - profitCents is null for non-sale entries or when no saleRepo wired
 * - profitCents resolves Sale.grossProfit for positive SALE_INCOME entries
 * - profitCents is null for negative SALE_INCOME (reversal/cancellation)
 * - profitCents is null for unresolved sale (sourceId doesn't match)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCashBoxMovementsUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetCashBoxMovementsUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { Sale } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { SaleLine } from '../../../src/modules/sales-returns/domain/SaleLine.js';
import { SaleLineId } from '../../../src/modules/sales-returns/domain/SaleLineId.js';

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

  const mockSaleRepo = {
    save: vi.fn(),
    findById: vi.fn(),
    findByCustomerId: vi.fn(),
    findByIds: vi.fn(),
    findAll: vi.fn(),
  };

  let useCase: GetCashBoxMovementsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no saleRepo wired — all profitCents will be null
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
    sourceId = 'source-1',
  ): CashLedgerEntry {
    return new CashLedgerEntry(
      CashLedgerEntryId.from(id),
      type,
      Money.fromCents(amountCents),
      sourceId,
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

    describe('profitCents resolution', () => {
      beforeEach(() => {
        useCase = new GetCashBoxMovementsUseCase(
          mockCashBoxRepo,
          mockCashLedgerRepo,
          mockSaleRepo,
        );
      });

      it('returns profitCents as null for non-sale entries when saleRepo is wired', async () => {
        const box = createBox('box-profit-1');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          makeEntry('e1', 'PURCHASE_OUTFLOW', -2000, 'box-profit-1'),
          makeEntry('e2', 'MANUAL_ADJUSTMENT', 300, 'box-profit-1'),
        ]);
        mockSaleRepo.findByIds.mockResolvedValue([]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-1' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries).toHaveLength(2);
        expect(result.value.entries[0]!.profitCents).toBeNull();
        expect(result.value.entries[1]!.profitCents).toBeNull();
        expect(mockSaleRepo.findByIds).not.toHaveBeenCalled();
      });

      it('returns profitCents as null for RETURN_OUTFLOW entries', async () => {
        const box = createBox('box-profit-return');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          new CashLedgerEntry(
            CashLedgerEntryId.from('e1'), 'RETURN_OUTFLOW',
            Money.fromCents(-1500), 'return-1', null, new Date(),
            CashBoxId.from('box-profit-return'), null,
          ),
        ]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-return' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries[0]!.profitCents).toBeNull();
        expect(mockSaleRepo.findByIds).not.toHaveBeenCalled();
      });

      it('returns profitCents as null for WITHDRAWAL entries', async () => {
        const box = createBox('box-profit-withdrawal');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          new CashLedgerEntry(
            CashLedgerEntryId.from('e1'), 'WITHDRAWAL',
            Money.fromCents(-5000), 'withdraw-1', null, new Date(),
            CashBoxId.from('box-profit-withdrawal'), null,
          ),
        ]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-withdrawal' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries[0]!.profitCents).toBeNull();
        expect(mockSaleRepo.findByIds).not.toHaveBeenCalled();
      });

      it('returns profitCents as null for SALE_INCOME with blank sourceId', async () => {
        const box = createBox('box-profit-blank-src');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          new CashLedgerEntry(
            CashLedgerEntryId.from('e1'), 'SALE_INCOME',
            Money.fromCents(5000), '', null, new Date(),
            CashBoxId.from('box-profit-blank-src'), null,
          ),
        ]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-blank-src' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries[0]!.profitCents).toBeNull();
        // findByIds should NOT be called — blank sourceId is skipped before lookup
        expect(mockSaleRepo.findByIds).not.toHaveBeenCalled();
      });

      it('returns profitCents as null for negative SALE_INCOME (reversal/cancellation)', async () => {
        const box = createBox('box-profit-2');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          makeEntry('e1', 'SALE_INCOME', -5000, 'box-profit-2'),
        ]);
        mockSaleRepo.findByIds.mockResolvedValue([]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-2' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries[0]!.profitCents).toBeNull();
        expect(mockSaleRepo.findByIds).not.toHaveBeenCalled();
      });

      it('resolves profitCents from Sale.grossProfit for positive SALE_INCOME entries', async () => {
        const saleId = 'sale-profit-1';
        const box = createBox('box-profit-3');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          makeEntry('e1', 'SALE_INCOME', 10000, 'box-profit-3', saleId),
        ]);

        // SaleLine with unitPrice=7000, qty=1, no consumptions → totalRevenue=7000, totalCost=0, grossProfit=7000
        const saleLine = new SaleLine(
          SaleLineId.generate(), 'variant-1', 1,
          Money.fromCents(7000), 'regular', [],
        );
        const sale = new Sale(
          SaleId.from(saleId), 'customer-1', undefined, 'whatsapp',
          [saleLine], 'ACTIVE', new Date(), new Date(),
        );
        mockSaleRepo.findByIds.mockResolvedValue([sale]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-3' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries).toHaveLength(1);
        expect(result.value.entries[0]!.profitCents).toBe(7000);
        expect(mockSaleRepo.findByIds).toHaveBeenCalledWith([
          SaleId.from(saleId),
        ]);
      });

      it('returns profitCents null when sale is not found for sourceId', async () => {
        const box = createBox('box-profit-4');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          makeEntry('e1', 'SALE_INCOME', 5000, 'box-profit-4', 'missing-sale-id'),
        ]);
        mockSaleRepo.findByIds.mockResolvedValue([]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-4' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries[0]!.profitCents).toBeNull();
      });

      it('returns profitCents null when sale status is not ACTIVE', async () => {
        const saleId = 'sale-cancelled';
        const box = createBox('box-profit-5');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          makeEntry('e1', 'SALE_INCOME', 5000, 'box-profit-5', saleId),
        ]);

        const saleLine = new SaleLine(
          SaleLineId.generate(), 'variant-1', 1,
          Money.fromCents(5000), 'regular', [],
        );
        const sale = new Sale(
          SaleId.from(saleId), 'customer-1', undefined, 'whatsapp',
          [saleLine], 'CANCELLED', new Date(), new Date(),
        );
        mockSaleRepo.findByIds.mockResolvedValue([sale]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-5' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries[0]!.profitCents).toBeNull();
      });

      it('resolves profitCents for multiple SALE_INCOME entries with batch lookup', async () => {
        const saleId1 = 'sale-batch-1';
        const saleId2 = 'sale-batch-2';
        const box = createBox('box-profit-6');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          makeEntry('e1', 'SALE_INCOME', 8000, 'box-profit-6', saleId1),
          makeEntry('e2', 'PURCHASE_OUTFLOW', -2000, 'box-profit-6'),
          makeEntry('e3', 'SALE_INCOME', 5000, 'box-profit-6', saleId2),
          makeEntry('e4', 'SALE_INCOME', -3000, 'box-profit-6', 'reversal-sale'),
        ]);

        // Sale 1: unitPrice=6000, qty=1 → totalRevenue=6000, totalCost=0, grossProfit=6000
        const line1 = new SaleLine(
          SaleLineId.generate(), 'variant-1', 1,
          Money.fromCents(6000), 'regular', [],
        );
        const sale1 = new Sale(
          SaleId.from(saleId1), 'c1', undefined, 'whatsapp', [line1],
          'ACTIVE', new Date(), new Date(),
        );

        // Sale 2: unitPrice=3500, qty=1 → totalRevenue=3500, totalCost=0, grossProfit=3500
        const line2 = new SaleLine(
          SaleLineId.generate(), 'variant-2', 1,
          Money.fromCents(3500), 'regular', [],
        );
        const sale2 = new Sale(
          SaleId.from(saleId2), 'c2', undefined, 'facebook', [line2],
          'ACTIVE', new Date(), new Date(),
        );

        mockSaleRepo.findByIds.mockResolvedValue([sale1, sale2]);

        const result = await useCase.execute({ cashBoxId: 'box-profit-6' });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries).toHaveLength(4);

        // e1 (SALE_INCOME 8000, sale1) → profit 6000
        expect(result.value.entries[0]!.profitCents).toBe(6000);
        // e2 (PURCHASE_OUTFLOW) → null
        expect(result.value.entries[1]!.profitCents).toBeNull();
        // e3 (SALE_INCOME 5000, sale2) → profit 3500
        expect(result.value.entries[2]!.profitCents).toBe(3500);
        // e4 (SALE_INCOME -3000, reversal) → null
        expect(result.value.entries[3]!.profitCents).toBeNull();

        // Batch lookup: should be called once with both sale IDs
        expect(mockSaleRepo.findByIds).toHaveBeenCalledWith([
          SaleId.from(saleId1),
          SaleId.from(saleId2),
        ]);
      });

      it('uses batch lookup (calls findByIds once, not findById N times)', async () => {
        const box = createBox('box-profit-7');
        mockFindById.mockResolvedValue(box);
        mockFindByCashBoxId.mockResolvedValue([
          makeEntry('e1', 'SALE_INCOME', 3000, 'box-profit-7', 'sale-a'),
          makeEntry('e2', 'SALE_INCOME', 4000, 'box-profit-7', 'sale-b'),
        ]);
        const lineA = new SaleLine(
          SaleLineId.generate(), 'variant-a', 1,
          Money.fromCents(3000), 'regular', [],
        );
        const saleA = new Sale(
          SaleId.from('sale-a'), 'c1', undefined, 'web', [lineA],
          'ACTIVE', new Date(), new Date(),
        );
        const lineB = new SaleLine(
          SaleLineId.generate(), 'variant-b', 1,
          Money.fromCents(4000), 'regular', [],
        );
        const saleB = new Sale(
          SaleId.from('sale-b'), 'c2', undefined, 'web', [lineB],
          'ACTIVE', new Date(), new Date(),
        );
        mockSaleRepo.findByIds.mockResolvedValue([saleA, saleB]);

        await useCase.execute({ cashBoxId: 'box-profit-7' });

        // findByIds called ONCE with all IDs
        expect(mockSaleRepo.findByIds).toHaveBeenCalledTimes(1);
        // findById (singular) should NOT be called
        expect(mockSaleRepo.findById).not.toHaveBeenCalled();
      });

      it('does NOT query profit for off-page sale entries (pagination boundary)', async () => {
        const box = createBox('box-profit-offpage');
        mockFindById.mockResolvedValue(box);

        // 3 SALE_INCOME entries: 2 on page 1 (pageSize=2), 1 off-page
        const lineA = new SaleLine(
          SaleLineId.generate(), 'variant-a', 1,
          Money.fromCents(3000), 'regular', [],
        );
        const saleA = new Sale(
          SaleId.from('sale-page-1a'), 'c1', undefined, 'web', [lineA],
          'ACTIVE', new Date(), new Date(),
        );
        const lineB = new SaleLine(
          SaleLineId.generate(), 'variant-b', 1,
          Money.fromCents(4000), 'regular', [],
        );
        const saleB = new Sale(
          SaleId.from('sale-page-1b'), 'c2', undefined, 'web', [lineB],
          'ACTIVE', new Date(), new Date(),
        );
        const lineC = new SaleLine(
          SaleLineId.generate(), 'variant-c', 1,
          Money.fromCents(5000), 'regular', [],
        );
        const saleC = new Sale(
          SaleId.from('sale-off-page'), 'c3', undefined, 'web', [lineC],
          'ACTIVE', new Date(), new Date(),
        );

        mockFindByCashBoxId.mockResolvedValue([
          makeEntry('e1', 'SALE_INCOME', 3000, 'box-profit-offpage', 'sale-page-1a'),
          makeEntry('e2', 'SALE_INCOME', 4000, 'box-profit-offpage', 'sale-page-1b'),
          makeEntry('e3', 'SALE_INCOME', 5000, 'box-profit-offpage', 'sale-off-page'),
        ]);

        mockSaleRepo.findByIds.mockResolvedValue([saleA, saleB, saleC]);

        // Request page 1 with pageSize=2 — only e1 and e2 are paged
        const result = await useCase.execute({
          cashBoxId: 'box-profit-offpage',
          page: 1,
          pageSize: 2,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.entries).toHaveLength(2);
        // Paged entries should have resolved profit
        expect(result.value.entries[0]!.profitCents).toBe(3000);
        expect(result.value.entries[1]!.profitCents).toBe(4000);
        // Total should be 3 (all matching entries before pagination)
        expect(result.value.total).toBe(3);
        // But findByIds should only have been called with paged source IDs
        expect(mockSaleRepo.findByIds).toHaveBeenCalledWith([
          SaleId.from('sale-page-1a'),
          SaleId.from('sale-page-1b'),
        ]);
        // The off-page sale 'sale-off-page' MUST NOT appear in the lookup
        const calledWith = (mockSaleRepo.findByIds.mock.calls[0]?.[0] ?? []) as SaleId[];
        const calledSourceIds = calledWith.map((s: SaleId) => s.toString());
        expect(calledSourceIds).not.toContain('sale-off-page');
      });
    });
  });
});
