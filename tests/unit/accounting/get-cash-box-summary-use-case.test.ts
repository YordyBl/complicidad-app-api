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
    type: 'SALE_INCOME' | 'PURCHASE_OUTFLOW' | 'RETURN_OUTFLOW' | 'MANUAL_ADJUSTMENT' | 'WITHDRAWAL',
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
      // Net movement = 6000 - 2000 - 500 + 300 - 800 = 3000
      expect(result.value.netMovementCents).toBe(3000);
      // Current balance = opening 1000 + net 3000 = 4000
      expect(result.value.currentBalanceCents).toBe(4000);
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
      expect(result.value.netMovementCents).toBe(0);
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
      expect(result.value.netMovementCents).toBe(2000);
    });
  });
});
