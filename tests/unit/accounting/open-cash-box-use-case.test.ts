/**
 * Unit tests for OpenCashBoxUseCase.
 *
 * Acceptance criteria:
 * - Opens today's caja with last closed balance or 0
 * - Rejects duplicate open for today
 * - Rejects with clear business error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCashBoxUseCase } from '../../../src/modules/accounting-reports/application/use-cases/OpenCashBoxUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { BusinessRuleError } from '../../../src/shared/domain/errors.js';

describe('OpenCashBoxUseCase', () => {
  // ── Mocks ───────────────────────────────────────────────────
  const mockSave = vi.fn();
  const mockFindByBusinessDate = vi.fn();
  const mockFindLastClosed = vi.fn();

  const mockCashBoxRepo = {
    save: mockSave,
    findByBusinessDate: mockFindByBusinessDate,
    findCurrent: vi.fn(),
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findLastClosed: mockFindLastClosed,
  };

  // Fixed business date for tests
  const TODAY = '2026-05-15';

  let useCase: OpenCashBoxUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new OpenCashBoxUseCase(mockCashBoxRepo);
  });

  // ── Helper: create a closed box (for "last closed") ──────────
  function createClosedBox(
    id: string,
    date: string,
    finalBalanceCents: number,
  ): CashBox {
    const open = new CashBox({
      id: CashBoxId.from(id),
      businessDate: date,
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: finalBalanceCents,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });
    return open.close(finalBalanceCents);
  }

  describe('execute', () => {
    it('opens a new cash box with balance 0 when no previous box exists', async () => {
      mockFindByBusinessDate.mockResolvedValue(null);
      mockFindLastClosed.mockResolvedValue(null);

      const result = await useCase.execute({ businessDate: TODAY });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.businessDate).toBe(TODAY);
      expect(result.value.status).toBe('OPEN');
      expect(result.value.openingBalanceCents).toBe(0);

      // Verify the saved box has correct fields
      expect(mockSave).toHaveBeenCalledTimes(1);
      const savedBox = mockSave.mock.calls[0]?.[0] as CashBox;
      expect(savedBox.businessDate).toBe(TODAY);
      expect(savedBox.openingBalanceCents).toBe(0);
      expect(savedBox.isOpen()).toBe(true);
    });

    it('opens a new cash box with last closed balance', async () => {
      const lastClosed = createClosedBox('last-closed', '2026-05-14', 15000);
      mockFindByBusinessDate.mockResolvedValue(null);
      mockFindLastClosed.mockResolvedValue(lastClosed);

      const result = await useCase.execute({ businessDate: TODAY });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.openingBalanceCents).toBe(15000);
      const savedBox = mockSave.mock.calls[0]?.[0] as CashBox;
      expect(savedBox.openingBalanceCents).toBe(15000);
    });

    it('rejects duplicate open when a box already exists for today', async () => {
      const existingBox = new CashBox({
        id: CashBoxId.generate(),
        businessDate: TODAY,
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 0,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date(),
      });
      mockFindByBusinessDate.mockResolvedValue(existingBox);

      const result = await useCase.execute({ businessDate: TODAY });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('Ya existe');
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('rejects opening for a past date with an existing closed box', async () => {
      const closedBox = createClosedBox('past-closed', '2026-05-13', 5000);
      mockFindByBusinessDate.mockResolvedValue(closedBox);

      const result = await useCase.execute({ businessDate: '2026-05-13' });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(mockSave).not.toHaveBeenCalled();
    });
  });
});
