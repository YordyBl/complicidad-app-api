/**
 * Unit tests for GetCashBoxSummaryUseCase.
 *
 * Acceptance criteria:
 * - Returns correct gross sales, cost, net, and current balance for a cash box
 * - Returns error when cash box not found
 * - Handles empty movement set (only opening balance)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCashBoxSummaryUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetCashBoxSummaryUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { CashBoxId as CashBoxIdDomain } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';
import { Money } from '../../../src/shared/domain/Money.js';

describe('GetCashBoxSummaryUseCase', () => {
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

  let useCase: GetCashBoxSummaryUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new GetCashBoxSummaryUseCase(mockCashBoxRepo, mockCashLedgerRepo);
  });

  function createBox(id: string, openingCents: number, currentCents: number, date = '2026-05-15'): CashBox {
    return new CashBox({
      id: CashBoxId.from(id),
      businessDate: date,
      status: 'OPEN',
      openingBalanceCents: openingCents,
      currentBalanceCents: currentCents,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });
  }

  function makeEntry(
    id: string,
    type: 'SALE_INCOME' | 'SALE_SETTLEMENT_INCOME' | 'PURCHASE_OUTFLOW' | 'RETURN_OUTFLOW' | 'MANUAL_ADJUSTMENT' | 'WITHDRAWAL',
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
      CashBoxIdDomain.from(cashBoxId),
      null,
    );
  }

  describe('execute', () => {
    it('returns correct summary for a cash box with multiple movement types', async () => {
      const box = createBox('box-sum-1', 1000, 5000);
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('e1', 'SALE_INCOME', 6000, 'box-sum-1'),
        makeEntry('e2', 'PURCHASE_OUTFLOW', -2000, 'box-sum-1'),
        makeEntry('e3', 'RETURN_OUTFLOW', -500, 'box-sum-1'),
        makeEntry('e4', 'MANUAL_ADJUSTMENT', 300, 'box-sum-1'),
        makeEntry('e5', 'WITHDRAWAL', -800, 'box-sum-1'),
      ]);

      const result = await useCase.execute({ cashBoxId: 'box-sum-1' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.cashBoxId).toBe('box-sum-1');
      expect(result.value.businessDate).toBe('2026-05-15');
      expect(result.value.openingBalanceCents).toBe(1000);

      // Gross sales = 6000
      expect(result.value.grossSalesCents).toBe(6000);
      // Purchase outflow = -2000
      expect(result.value.purchaseOutflowCents).toBe(-2000);
      // Return outflow = -500
      expect(result.value.returnOutflowCents).toBe(-500);
      // Manual adjustments = 300
      expect(result.value.manualAdjustmentsCents).toBe(300);
      // Withdrawals = -800
      expect(result.value.withdrawalsCents).toBe(-800);
      // Current balance = opening 1000 + signed movement (3000) = 4000
      expect(result.value.currentBalanceCents).toBe(4000);
    });

    it('includes netMovementCents in the response', async () => {
      const box = createBox('box-no-net', 1000, 5000);
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('e1', 'SALE_INCOME', 3000, 'box-no-net'),
      ]);

      const result = await useCase.execute({ cashBoxId: 'box-no-net' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // netMovementCents = sum of all signed movements (3000)
      expect(result.value).toHaveProperty('netMovementCents');
      expect(result.value.netMovementCents).toBe(3000);
    });

    it('handles negative manual adjustment correctly', async () => {
      const box = createBox('box-neg-manual', 5000, 5000);
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('e1', 'SALE_INCOME', 4000, 'box-neg-manual'),
        makeEntry('e2', 'MANUAL_ADJUSTMENT', -1000, 'box-neg-manual'),
      ]);

      const result = await useCase.execute({ cashBoxId: 'box-neg-manual' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // manualAdjustmentsCents = -1000 (negative adjustment)
      expect(result.value.manualAdjustmentsCents).toBe(-1000);
      // currentBalance = 5000 + (4000 + (-1000)) = 8000
      expect(result.value.currentBalanceCents).toBe(8000);
    });

    it('returns summary with zero movements when no entries exist', async () => {
      const box = createBox('box-empty', 5000, 5000);
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([]);

      const result = await useCase.execute({ cashBoxId: 'box-empty' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.openingBalanceCents).toBe(5000);
      expect(result.value.grossSalesCents).toBe(0);
      expect(result.value.purchaseOutflowCents).toBe(0);
      expect(result.value.returnOutflowCents).toBe(0);
      expect(result.value.currentBalanceCents).toBe(5000);
    });

    it('returns error when cash box is not found', async () => {
      mockFindById.mockResolvedValue(null);

      const result = await useCase.execute({ cashBoxId: 'non-existent' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(mockFindByCashBoxId).not.toHaveBeenCalled();
    });

    it('counts SALE_SETTLEMENT_INCOME as gross sales cash', async () => {
      const box = createBox('box-settlement', 1000, 5000);
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('e1', 'SALE_SETTLEMENT_INCOME', 7000, 'box-settlement'),
      ]);

      const result = await useCase.execute({ cashBoxId: 'box-settlement' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Settlement income counts as sales cash
      expect(result.value.grossSalesCents).toBe(7000);
      expect(result.value.currentBalanceCents).toBe(8000); // 1000 opening + 7000
    });

    it('counts both SALE_INCOME and SALE_SETTLEMENT_INCOME as gross sales', async () => {
      const box = createBox('box-mixed-sales', 0, 0);
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('e1', 'SALE_INCOME', 3000, 'box-mixed-sales'),
        makeEntry('e2', 'SALE_SETTLEMENT_INCOME', 7000, 'box-mixed-sales'),
        makeEntry('e3', 'PURCHASE_OUTFLOW', -2000, 'box-mixed-sales'),
      ]);

      const result = await useCase.execute({ cashBoxId: 'box-mixed-sales' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Both income types count as gross sales (= 10000)
      expect(result.value.grossSalesCents).toBe(10000);
      expect(result.value.purchaseOutflowCents).toBe(-2000);
      expect(result.value.currentBalanceCents).toBe(8000);
    });

    it('includes only entries for the requested cash box', async () => {
      const box = createBox('box-specific', 0, 2000);
      mockFindById.mockResolvedValue(box);
      mockFindByCashBoxId.mockImplementation(async (id: string) => {
        if (id === 'box-specific') {
          return [makeEntry('e1', 'SALE_INCOME', 2000, 'box-specific')];
        }
        return [];
      });

      const result = await useCase.execute({ cashBoxId: 'box-specific' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.grossSalesCents).toBe(2000);
      expect(result.value.currentBalanceCents).toBe(2000);
    });
  });
});
