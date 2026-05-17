/**
 * Unit tests for CloseCashBoxUseCase.
 *
 * Acceptance criteria:
 * - Closes the current OPEN cash box, deriving final balance from the cash ledger
 * - Rejects when no open cash box exists
 * - Rejects when already closed
 * - Does NOT trust client-provided finalBalanceCents — derived from authoritative ledger
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloseCashBoxUseCase } from '../../../src/modules/accounting-reports/application/use-cases/CloseCashBoxUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { BusinessRuleError } from '../../../src/shared/domain/errors.js';

describe('CloseCashBoxUseCase', () => {
  const mockFindCurrent = vi.fn();
  const mockSave = vi.fn();
  const mockCashBoxRepo = {
    save: mockSave,
    findByBusinessDate: vi.fn(),
    findCurrent: mockFindCurrent,
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findLastClosed: vi.fn(),
  };

  const mockFindByCashBoxId = vi.fn();
  const mockLedgerRepo = {
    append: vi.fn(),
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findByCashBoxId: mockFindByCashBoxId,
  };

  let useCase: CloseCashBoxUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new CloseCashBoxUseCase(mockCashBoxRepo, mockLedgerRepo);
  });

  function createOpenBox(
    id: string,
    currentBalanceCents = 5000,
    openingBalanceCents = 0,
  ): CashBox {
    return new CashBox({
      id: CashBoxId.from(id),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents,
      currentBalanceCents,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });
  }

  function makeEntry(
    type: 'SALE_INCOME' | 'PURCHASE_OUTFLOW' | 'RETURN_OUTFLOW' | 'MANUAL_ADJUSTMENT' | 'WITHDRAWAL',
    amountCents: number,
    sourceId: string,
    cashBoxId: string,
  ): CashLedgerEntry {
    return new CashLedgerEntry(
      CashLedgerEntryId.generate(),
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
    // ── Explicit test for current behaviour (tests will FAIL until use case updated) ──

    it('derives final balance from ledger: openingBalanceCents + sum of entries', async () => {
      const boxId = 'box-ledger-1';
      const openBox = createOpenBox(boxId, 5000, 10000); // opening=10000, current snapshot=5000 (ignored)
      mockFindCurrent.mockResolvedValue(openBox);

      // Ledger entries: +5000 sale, -2000 purchase = net +3000
      // Final balance: 10000 + 3000 = 13000
      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('SALE_INCOME', 5000, 'sale-1', boxId),
        makeEntry('PURCHASE_OUTFLOW', -2000, 'purchase-1', boxId),
      ]);

      const result = await useCase.execute({});

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalBalanceCents).toBe(13000);
      expect(result.value.status).toBe('CLOSED');
      expect(result.value.closedAt).not.toBeNull();

      // Verify ledger was queried for this box
      expect(mockFindByCashBoxId).toHaveBeenCalledWith(boxId);
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('closes with finalBalanceCents = openingBalanceCents when no ledger entries exist', async () => {
      const boxId = 'box-no-movements';
      const openBox = createOpenBox(boxId, 5000, 8000);
      mockFindCurrent.mockResolvedValue(openBox);
      mockFindByCashBoxId.mockResolvedValue([]);

      const result = await useCase.execute({});

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalBalanceCents).toBe(8000);
    });

    it('handles only negative movements (net outflow)', async () => {
      const boxId = 'box-outflow';
      const openBox = createOpenBox(boxId, 0, 50000);
      mockFindCurrent.mockResolvedValue(openBox);

      mockFindByCashBoxId.mockResolvedValue([
        makeEntry('PURCHASE_OUTFLOW', -10000, 'p-1', boxId),
        makeEntry('WITHDRAWAL', -5000, 'w-1', boxId),
        makeEntry('RETURN_OUTFLOW', -3000, 'r-1', boxId),
      ]);

      const result = await useCase.execute({});

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 50000 - 10000 - 5000 - 3000 = 32000
      expect(result.value.finalBalanceCents).toBe(32000);
    });

    it('rejects when no open cash box exists', async () => {
      mockFindCurrent.mockResolvedValue(null);

      const result = await useCase.execute({});

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('No hay');
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('rejects when cash box is already closed', async () => {
      const closedBox = new CashBox({
        id: CashBoxId.from('box-already-closed'),
        businessDate: '2026-05-15',
        status: 'CLOSED',
        openingBalanceCents: 0,
        currentBalanceCents: 5000,
        finalBalanceCents: 5000,
        closedAt: new Date(),
        legacy: false,
        createdAt: new Date(),
      });
      mockFindCurrent.mockResolvedValue(closedBox);
      mockFindByCashBoxId.mockResolvedValue([]);

      const result = await useCase.execute({});

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('cerrada');
    });
  });
});
