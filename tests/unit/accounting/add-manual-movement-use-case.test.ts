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

    it('accepts positive WITHDRAWAL input and normalizes it to negative cents', async () => {
      // Spec: clients send positive cents for WITHDRAWAL; API normalizes to negative.
      const box = createOpenBox('box-mm-2');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Retiro de efectivo',
        amountCents: 1000,
        type: 'WITHDRAWAL',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The stored and returned amount must be negative (the API normalizes it).
      expect(result.value.type).toBe('WITHDRAWAL');
      expect(result.value.amountCents).toBe(-1000);

      // Verify the entry was persisted with negative amount
      expect(mockAppend).toHaveBeenCalledTimes(1);
      const savedEntry = mockAppend.mock.calls[0]?.[0];
      expect(savedEntry.type).toBe('WITHDRAWAL');
      expect(savedEntry.amount.cents).toBe(-1000);
      expect(savedEntry.concept).toBe('Retiro de efectivo');
    });

    it('normalizes a WITHDRAWAL with a different positive amount', async () => {
      const box = createOpenBox('box-mm-2b');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Retiro grande',
        amountCents: 5000,
        type: 'WITHDRAWAL',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.amountCents).toBe(-5000);
      const savedEntry = mockAppend.mock.calls[0]?.[0];
      expect(savedEntry.amount.cents).toBe(-5000);
    });

    it('still normalizes WITHDRAWAL to negative even when already sent as negative', async () => {
      // For backward compatibility: clients still sending negative receive negative.
      const box = createOpenBox('box-mm-2c');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Retiro (ya negativo)',
        amountCents: -1000,
        type: 'WITHDRAWAL',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // -Math.abs(-1000) = -1000 — still negative, correct
      expect(result.value.amountCents).toBe(-1000);
      const savedEntry = mockAppend.mock.calls[0]?.[0];
      expect(savedEntry.amount.cents).toBe(-1000);
    });

    it('keeps MANUAL_ADJUSTMENT sign unchanged (positive stays positive)', async () => {
      const box = createOpenBox('box-mm-2d');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Ajuste positivo',
        amountCents: 3000,
        type: 'MANUAL_ADJUSTMENT',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.amountCents).toBe(3000);
      const savedEntry = mockAppend.mock.calls[0]?.[0];
      expect(savedEntry.type).toBe('MANUAL_ADJUSTMENT');
      expect(savedEntry.amount.cents).toBe(3000);
    });

    it('keeps MANUAL_ADJUSTMENT sign unchanged (negative stays negative)', async () => {
      const box = createOpenBox('box-mm-2e');
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute({
        concept: 'Ajuste negativo',
        amountCents: -500,
        type: 'MANUAL_ADJUSTMENT',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.amountCents).toBe(-500);
      const savedEntry = mockAppend.mock.calls[0]?.[0];
      expect(savedEntry.type).toBe('MANUAL_ADJUSTMENT');
      expect(savedEntry.amount.cents).toBe(-500);
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
