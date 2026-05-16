/**
 * Unit tests for ReverseMovementUseCase.
 *
 * Acceptance criteria:
 * - Appends an opposite reversal entry for an existing movement
 * - Original movement remains unchanged
 * - Rejects when movement not found
 * - Rejects when movement's cash box is not open (closed or missing)
 * - Reverses any entry type correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReverseMovementUseCase } from '../../../src/modules/accounting-reports/application/use-cases/ReverseMovementUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { BusinessRuleError, NotFoundError } from '../../../src/shared/domain/errors.js';
import { Money } from '../../../src/shared/domain/Money.js';

describe('ReverseMovementUseCase', () => {
  const mockFindByIdLedger = vi.fn();
  const mockFindByIdBox = vi.fn();
  const mockAppend = vi.fn();

  const mockCashBoxRepo = {
    save: vi.fn(),
    findByBusinessDate: vi.fn(),
    findCurrent: vi.fn(),
    findById: mockFindByIdBox,
    findAllOrdered: vi.fn(),
    findLastClosed: vi.fn(),
  };

  const mockCashLedgerRepo = {
    append: mockAppend,
    findById: mockFindByIdLedger,
    findAllOrdered: vi.fn(),
    findByCashBoxId: vi.fn(),
  };

  let useCase: ReverseMovementUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ReverseMovementUseCase(mockCashBoxRepo, mockCashLedgerRepo);
  });

  function makeEntry(
    id: string,
    type: 'SALE_INCOME' | 'PURCHASE_OUTFLOW' | 'RETURN_OUTFLOW' | 'MANUAL_ADJUSTMENT' | 'WITHDRAWAL',
    amountCents: number,
    cashBoxId: string,
    concept: string | null = null,
  ): CashLedgerEntry {
    return new CashLedgerEntry(
      CashLedgerEntryId.from(id),
      type,
      Money.fromCents(amountCents),
      'source-1',
      null,
      new Date(),
      CashBoxId.from(cashBoxId),
      concept,
    );
  }

  function createOpenBox(id: string): CashBox {
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

  function createClosedBox(id: string): CashBox {
    const open = createOpenBox(id);
    return open.close(5000);
  }

  describe('execute', () => {
    it('reverses a MANUAL_ADJUSTMENT by appending an opposite entry', async () => {
      const box = createOpenBox('box-rev-1');
      const entry = makeEntry('entry-1', 'MANUAL_ADJUSTMENT', 500, 'box-rev-1', 'Gasto menor');

      mockFindByIdLedger.mockResolvedValue(entry);
      mockFindByIdBox.mockResolvedValue(box);

      const result = await useCase.execute({ movementId: 'entry-1' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.reversedId).toBe('entry-1');
      expect(result.value.type).toBe('MANUAL_ADJUSTMENT');
      expect(result.value.amountCents).toBe(-500);

      // Original remains unchanged
      expect(entry.amount.cents).toBe(500);

      // Verify append was called with opposite entry
      expect(mockAppend).toHaveBeenCalledTimes(1);
      const reversalEntry = mockAppend.mock.calls[0]?.[0];
      expect(reversalEntry.type).toBe('MANUAL_ADJUSTMENT');
      expect(reversalEntry.amount.cents).toBe(-500);
      expect(reversalEntry.concept).toContain('Reversión');
    });

    it('reverses a SALE_INCOME entry', async () => {
      const box = createOpenBox('box-rev-2');
      const entry = makeEntry('entry-2', 'SALE_INCOME', 6000, 'box-rev-2');

      mockFindByIdLedger.mockResolvedValue(entry);
      mockFindByIdBox.mockResolvedValue(box);

      const result = await useCase.execute({ movementId: 'entry-2' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.type).toBe('SALE_INCOME');
      expect(result.value.amountCents).toBe(-6000);
    });

    it('rejects when movement is not found', async () => {
      mockFindByIdLedger.mockResolvedValue(null);

      const result = await useCase.execute({ movementId: 'non-existent' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(mockAppend).not.toHaveBeenCalled();
    });

    it('rejects when movement has no cash box (legacy entry)', async () => {
      const legacyEntry = new CashLedgerEntry(
        CashLedgerEntryId.from('legacy-1'),
        'SALE_INCOME',
        Money.fromCents(1000),
        'source-1',
        null,
        new Date(),
        null, // no cashBoxId (legacy)
        null,
      );
      mockFindByIdLedger.mockResolvedValue(legacyEntry);

      const result = await useCase.execute({ movementId: 'legacy-1' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(mockAppend).not.toHaveBeenCalled();
    });

    it('rejects when movement belongs to a closed cash box', async () => {
      const box = createClosedBox('box-closed-1');
      const entry = makeEntry('entry-3', 'WITHDRAWAL', -300, 'box-closed-1');

      mockFindByIdLedger.mockResolvedValue(entry);
      mockFindByIdBox.mockResolvedValue(box);

      const result = await useCase.execute({ movementId: 'entry-3' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('cerrada');
      expect(mockAppend).not.toHaveBeenCalled();
    });
  });
});
