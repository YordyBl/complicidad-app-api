/**
 * Unit tests for CloseCashBoxUseCase.
 *
 * Acceptance criteria:
 * - Closes the current OPEN cash box with a final balance
 * - Rejects when no open cash box exists
 * - Rejects when already closed
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloseCashBoxUseCase } from '../../../src/modules/accounting-reports/application/use-cases/CloseCashBoxUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
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

  let useCase: CloseCashBoxUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new CloseCashBoxUseCase(mockCashBoxRepo);
  });

  function createOpenBox(
    id: string,
    currentBalanceCents = 5000,
  ): CashBox {
    return new CashBox({
      id: CashBoxId.from(id),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });
  }

  describe('execute', () => {
    it('closes the current open cash box with final balance', async () => {
      const openBox = createOpenBox('box-close-1', 5000);
      mockFindCurrent.mockResolvedValue(openBox);

      const result = await useCase.execute({ finalBalanceCents: 5000 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.status).toBe('CLOSED');
      expect(result.value.finalBalanceCents).toBe(5000);
      expect(result.value.closedAt).not.toBeNull();

      // Verify save was called with a CLOSED box
      expect(mockSave).toHaveBeenCalledTimes(1);
      const savedBox = mockSave.mock.calls[0]?.[0] as CashBox;
      expect(savedBox.isClosed()).toBe(true);
      expect(savedBox.finalBalanceCents).toBe(5000);
    });

    it('allows closing balance to differ from current (reconciliation)', async () => {
      const openBox = createOpenBox('box-reconcile', 5000);
      mockFindCurrent.mockResolvedValue(openBox);

      const result = await useCase.execute({ finalBalanceCents: 4800 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.finalBalanceCents).toBe(4800);
    });

    it('rejects when no open cash box exists', async () => {
      mockFindCurrent.mockResolvedValue(null);

      const result = await useCase.execute({ finalBalanceCents: 0 });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('No hay');
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('rejects with invalid (non-integer) final balance', async () => {
      const openBox = createOpenBox('box-bad-bal', 5000);
      mockFindCurrent.mockResolvedValue(openBox);

      const result = await useCase.execute({ finalBalanceCents: 1.5 });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(mockSave).not.toHaveBeenCalled();
    });
  });
});
