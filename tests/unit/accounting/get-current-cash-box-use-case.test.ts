/**
 * Unit tests for GetCurrentCashBoxUseCase.
 *
 * Acceptance criteria:
 * - Returns the current OPEN cash box when one exists
 * - Returns error when no OPEN cash box exists
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCurrentCashBoxUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetCurrentCashBoxUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';

describe('GetCurrentCashBoxUseCase', () => {
  const mockFindCurrent = vi.fn();
  const mockCashBoxRepo = {
    save: vi.fn(),
    findByBusinessDate: vi.fn(),
    findCurrent: mockFindCurrent,
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findLastClosed: vi.fn(),
  };

  let useCase: GetCurrentCashBoxUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new GetCurrentCashBoxUseCase(mockCashBoxRepo);
  });

  describe('execute', () => {
    it('returns the current open cash box when one exists', async () => {
      const now = new Date();
      const box = new CashBox({
        id: CashBoxId.from('current-box-1'),
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 1000,
        currentBalanceCents: 5000,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: now,
      });
      mockFindCurrent.mockResolvedValue(box);

      const result = await useCase.execute();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.id).toBe('current-box-1');
      expect(result.value.businessDate).toBe('2026-05-15');
      expect(result.value.status).toBe('OPEN');
      expect(result.value.openingBalanceCents).toBe(1000);
      expect(result.value.currentBalanceCents).toBe(5000);
    });

    it('returns error when no open cash box exists', async () => {
      mockFindCurrent.mockResolvedValue(null);

      const result = await useCase.execute();

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(result.error.message).toContain('abierta');
    });
  });
});
