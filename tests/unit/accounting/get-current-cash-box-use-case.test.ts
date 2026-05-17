/**
 * Unit tests for GetCurrentCashBoxUseCase.
 *
 * Acceptance criteria:
 * - Returns the current OPEN cash box when one exists
 * - Computes live currentBalanceCents from ledger entries (not stale snapshot)
 * - Returns error when no OPEN cash box exists
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCurrentCashBoxUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetCurrentCashBoxUseCase.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';

describe('GetCurrentCashBoxUseCase', () => {
  const mockFindCurrent = vi.fn();
  const mockFindByCashBoxId = vi.fn();

  const mockCashBoxRepo = {
    save: vi.fn(),
    findByBusinessDate: vi.fn(),
    findCurrent: mockFindCurrent,
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findLastClosed: vi.fn(),
  };

  const mockCashLedgerRepo = {
    append: vi.fn(),
    findById: vi.fn(),
    findAllOrdered: vi.fn(),
    findByCashBoxId: mockFindByCashBoxId,
  };

  let useCase: GetCurrentCashBoxUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new GetCurrentCashBoxUseCase(mockCashBoxRepo, mockCashLedgerRepo);
  });

  function createFakeLedgerEntry(
    type: string,
    amountCents: number,
  ) {
    return {
      type,
      amount: { cents: amountCents },
      concept: null,
      // minimal shape for the use case to compute sum
    } as unknown as import('../../../src/modules/accounting-reports/domain/CashLedgerEntry.js').CashLedgerEntry;
  }

  describe('execute', () => {
    it('returns the current open cash box with live balance from ledger', async () => {
      const now = new Date();
      const box = new CashBox({
        id: CashBoxId.from('current-box-1'),
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 20000,      // 200 soles opening
        currentBalanceCents: 99999,      // STALE snapshot — use case must ignore this
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: now,
      });
      mockFindCurrent.mockResolvedValue(box);

      // Ledger entries: sale +5000, withdrawal -10000 → net -5000
      mockFindByCashBoxId.mockResolvedValue([
        createFakeLedgerEntry('SALE_INCOME', 5000),
        createFakeLedgerEntry('WITHDRAWAL', -10000),
      ]);

      const result = await useCase.execute();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.id).toBe('current-box-1');
      expect(result.value.businessDate).toBe('2026-05-15');
      expect(result.value.status).toBe('OPEN');
      expect(result.value.openingBalanceCents).toBe(20000);
      // Live balance: opening (20000) + sale (5000) + withdrawal (-10000) = 15000
      expect(result.value.currentBalanceCents).toBe(15000);
      expect(result.value.isCurrent).toBe(true);
    });

    it('returns opening balance as current when no ledger entries exist', async () => {
      const box = new CashBox({
        id: CashBoxId.from('current-box-empty'),
        businessDate: '2026-05-16',
        status: 'OPEN',
        openingBalanceCents: 5000,
        currentBalanceCents: 99999, // stale
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date(),
      });
      mockFindCurrent.mockResolvedValue(box);
      mockFindByCashBoxId.mockResolvedValue([]);

      const result = await useCase.execute();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.currentBalanceCents).toBe(5000);
      expect(result.value.isCurrent).toBe(true);
    });

    it('computes live balance from opening plus withdrawal only: 200 soles opening + 100 soles withdrawal => 100 soles', async () => {
      // GIVEN current Caja balance is 200 soles (openingBalanceCents = 20000)
      const box = new CashBox({
        id: CashBoxId.from('current-box-w-only'),
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 20000,
        currentBalanceCents: 99999, // stale
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date(),
      });
      mockFindCurrent.mockResolvedValue(box);

      // Ledger: only a WITHDRAWAL of 100 soles, stored as -10000 cents
      mockFindByCashBoxId.mockResolvedValue([
        createFakeLedgerEntry('WITHDRAWAL', -10000),
      ]);

      const result = await useCase.execute();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.openingBalanceCents).toBe(20000);
      // Live balance: opening (20000) + withdrawal (-10000) = 10000 cents = 100 soles
      expect(result.value.currentBalanceCents).toBe(10000);
      expect(result.value.isCurrent).toBe(true);
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
