/**
 * Unit tests for AddManualMovementUseCase.
 *
 * Acceptance criteria:
 * - Appends a manual movement to the current open cash box
 * - Rejects when no open cash box exists
 * - Rejects with invalid amount (0 or non-integer)
 * - Requires concept to be non-empty
 * - Rejects with invalid entry type
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddManualMovementUseCase } from '../../../src/modules/accounting-reports/application/use-cases/AddManualMovementUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { BusinessRuleError } from '../../../src/shared/domain/errors.js';

describe('AddManualMovementUseCase', () => {
  const mockFindCurrent = vi.fn();
  const mockAppend = vi.fn();

  const mockCashBoxRepo = {
    save: vi.fn(),
    findByBusinessDate: vi.fn(),
    findCurrent: mockFindCurrent,
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findLastClosed: vi.fn(),
  };

  const mockCashLedgerRepo = {
    append: mockAppend,
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findByCashBoxId: vi.fn(),
  };

  let useCase: AddManualMovementUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new AddManualMovementUseCase(mockCashBoxRepo, mockCashLedgerRepo);
  });

  function createOpenBox(id: string, currentCents = 5000): CashBox {
    return new CashBox({
      id: CashBoxId.from(id),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 1000,
      currentBalanceCents: currentCents,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });
  }

  describe('execute', () => {
    it('appends a MANUAL_ADJUSTMENT to the current open box', async () => {
      const box = createOpenBox('box-mm-1');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Corrección de caja',
        amountCents: 500,
        type: 'MANUAL_ADJUSTMENT',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.concept).toBe('Corrección de caja');
      expect(result.value.amountCents).toBe(500);
      expect(result.value.type).toBe('MANUAL_ADJUSTMENT');
      expect(result.value.cashBoxId).toBe('box-mm-1');

      // Verify the entry was appended
      expect(mockAppend).toHaveBeenCalledTimes(1);
      const savedEntry = mockAppend.mock.calls[0]?.[0];
      expect(savedEntry.type).toBe('MANUAL_ADJUSTMENT');
      expect(savedEntry.amount.cents).toBe(500);
      expect(savedEntry.concept).toBe('Corrección de caja');
      expect(savedEntry.cashBoxId?.toString()).toBe('box-mm-1');
    });

    it('appends a WITHDRAWAL with negative amount to the current open box', async () => {
      const box = createOpenBox('box-mm-2');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Retiro de efectivo',
        amountCents: -1000,
        type: 'WITHDRAWAL',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.type).toBe('WITHDRAWAL');
      expect(result.value.amountCents).toBe(-1000);
    });

    it('rejects when no open cash box exists', async () => {
      mockFindCurrent.mockResolvedValue(null);

      const result = await useCase.execute({
        concept: 'Gasto menor',
        amountCents: -200,
        type: 'WITHDRAWAL',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('caja abierta');
      expect(mockAppend).not.toHaveBeenCalled();
    });

    it('rejects with zero amount', async () => {
      const box = createOpenBox('box-mm-3');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Movimiento cero',
        amountCents: 0,
        type: 'MANUAL_ADJUSTMENT',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(mockAppend).not.toHaveBeenCalled();
    });

    it('rejects with empty concept', async () => {
      const box = createOpenBox('box-mm-4');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: '',
        amountCents: 100,
        type: 'MANUAL_ADJUSTMENT',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(mockAppend).not.toHaveBeenCalled();
    });

    it('rejects with invalid entry type', async () => {
      const box = createOpenBox('box-mm-5');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Test',
        amountCents: 100,
        type: 'SALE_INCOME' as never,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(mockAppend).not.toHaveBeenCalled();
    });
  });
});
