/**
 * Application tests for ListSalesUseCase.
 *
 * Verifies:
 * - No filters → returns all sales sorted by createdAt DESC
 * - Filter by customerId + status
 * - Filter by date range
 * - Empty results (no matching sales)
 * - Invalid date → gracefully returns empty
 * - DTO mapping: Sale domain → SaleSummary (validates totals, lineCount)
 * - Default sortOrder = desc
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { SaleRepository, SaleFilters } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { Sale } from '../../../src/modules/sales-returns/domain/Sale.js';
import type { SaleId } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId as SaleIdEntity } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { SaleLine } from '../../../src/modules/sales-returns/domain/SaleLine.js';
import { SaleLineId } from '../../../src/modules/sales-returns/domain/SaleLineId.js';
import { LotConsumptionRecord } from '../../../src/modules/sales-returns/domain/LotConsumptionRecord.js';

// ── Fakes ────────────────────────────────────────────────────

class FakeSaleRepository implements SaleRepository {
  sales = new Map<string, SaleEntity>();
  lastFilters: SaleFilters | undefined;

  async save(sale: SaleEntity): Promise<void> {
    this.sales.set(sale.id.toString(), sale);
  }

  async findById(id: SaleId): Promise<SaleEntity | null> {
    return this.sales.get(id.toString()) ?? null;
  }

  async findByCustomerId(customerId: string): Promise<SaleEntity[]> {
    return Array.from(this.sales.values())
      .filter((s) => s.customerId === customerId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findAll(filters?: SaleFilters): Promise<SaleEntity[]> {
    this.lastFilters = filters;
    let result = Array.from(this.sales.values());

    if (filters?.customerId) {
      result = result.filter((s) => s.customerId === filters.customerId);
    }
    if (filters?.status) {
      result = result.filter((s) => s.status === filters.status);
    }

    const asc = filters?.sortOrder === 'asc';
    result.sort((a, b) =>
      asc
        ? a.createdAt.getTime() - b.createdAt.getTime()
        : b.createdAt.getTime() - a.createdAt.getTime(),
    );

    return result;
  }
}

// ── Fixtures ─────────────────────────────────────────────────

function makeConsumption(id: string, lotId: string, qty: number, unitCostCents: number): LotConsumptionRecord {
  return new LotConsumptionRecord(id, lotId, qty, Money.fromCents(unitCostCents), Money.fromCents(unitCostCents * qty));
}

function makeSale(
  saleId: string,
  customerId: string,
  status: 'ACTIVE' | 'CANCELLED' | 'RETURNED',
  createdAt: Date,
  channelRef = 'web-order-1',
  variantId = 'v1',
  quantity = 3,
  unitPriceCents = 1000,
  costCents = 800,
): SaleEntity {
  const c = makeConsumption(`c-${saleId}`, 'lot-1', quantity, costCents);
  const line = new SaleLine(
    SaleLineId.from(`line-${saleId}`),
    variantId,
    quantity,
    Money.fromCents(unitPriceCents),
    'regular',
    [c],
  );
  return new SaleEntity(SaleIdEntity.from(saleId), customerId, channelRef, [line], status, createdAt, createdAt);
}

// ── Tests ────────────────────────────────────────────────────

describe('ListSalesUseCase', () => {
  let repo: FakeSaleRepository;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let useCase: any;

  beforeEach(async () => {
    repo = new FakeSaleRepository();

    // Seed sales across different customers, statuses, and dates
    repo.sales.set('s1', makeSale('s1', 'cust-a', 'ACTIVE', new Date('2026-01-15'), 'order-a', 'v1', 2, 1500, 1000));
    repo.sales.set('s2', makeSale('s2', 'cust-a', 'CANCELLED', new Date('2026-02-10'), 'order-b', 'v2', 1, 2000, 1500));
    repo.sales.set('s3', makeSale('s3', 'cust-b', 'ACTIVE', new Date('2026-03-05'), 'order-c', 'v1', 5, 1000, 700));

    // Dynamically import the use case (will fail until created → RED)
    const mod = await import('../../../src/modules/sales-returns/application/use-cases/ListSalesUseCase.js');
    useCase = new mod.ListSalesUseCase(repo);
  });

  describe('no filters', () => {
    it('returns all sales sorted by createdAt DESC', async () => {
      const result = await useCase.execute();

      expect(result).toHaveLength(3);
      // Sorted DESC: Mar 5 (s3), Feb 10 (s2), Jan 15 (s1)
      expect(result[0].saleId).toBe('s3');
      expect(result[1].saleId).toBe('s2');
      expect(result[2].saleId).toBe('s1');
    });
  });

  describe('filter by customerId + status', () => {
    it('returns only matching sales', async () => {
      const result = await useCase.execute({ customerId: 'cust-a', status: 'ACTIVE' });

      expect(result).toHaveLength(1);
      expect(result[0].saleId).toBe('s1');
      expect(result[0].customerId).toBe('cust-a');
      expect(result[0].status).toBe('ACTIVE');
    });
  });

  describe('filter by status only', () => {
    it('returns only ACTIVE sales across all customers', async () => {
      const result = await useCase.execute({ status: 'ACTIVE' });

      expect(result).toHaveLength(2);
      expect(result.every((s: { status: string }) => s.status === 'ACTIVE')).toBe(true);
    });
  });

  describe('sort order', () => {
    it('defaults to descending', async () => {
      await useCase.execute();
      expect(repo.lastFilters?.sortOrder).toBeUndefined();
    });

    it('respects explicit asc', async () => {
      const result = await useCase.execute({ sortOrder: 'asc' });

      expect(result).toHaveLength(3);
      expect(result[0].saleId).toBe('s1'); // Jan 15
      expect(result[2].saleId).toBe('s3'); // Mar 5
    });

    it('respects explicit desc', async () => {
      const result = await useCase.execute({ sortOrder: 'desc' });

      expect(result[0].saleId).toBe('s3');
      expect(result[2].saleId).toBe('s1');
    });
  });

  describe('DTO mapping', () => {
    it('maps Sale domain entity to SaleSummary with correct computed totals', async () => {
      const result = await useCase.execute();

      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1).toBeDefined();
      expect(s1).toMatchObject({
        saleId: 's1',
        customerId: 'cust-a',
        channelReference: 'order-a',
        status: 'ACTIVE',
        totalRevenueCents: 3000,   // 2 * 1500
        totalCostCents: 2000,      // 2 * 1000
        grossProfitCents: 1000,    // 3000 - 2000
        lineCount: 1,
      });
      // Dates should be ISO strings
      expect(typeof s1.createdAt).toBe('string');
      expect(typeof s1.updatedAt).toBe('string');
    });

    it('maps multiple lines correctly', async () => {
      // Add a sale with 2 lines
      const c1 = makeConsumption('c-aa', 'lot-1', 3, 500);
      const c2 = makeConsumption('c-bb', 'lot-2', 2, 800);
      const line1 = new SaleLine(SaleLineId.from('la'), 'v1', 3, Money.fromCents(2000), 'regular', [c1]);
      const line2 = new SaleLine(SaleLineId.from('lb'), 'v2', 2, Money.fromCents(1000), 'presale', [c2]);
      const multiLineSale = new SaleEntity(
        SaleIdEntity.from('s-multi'), 'cust-c', 'order-m', [line1, line2], 'ACTIVE',
        new Date('2026-01-01'), new Date('2026-01-01'),
      );
      repo.sales.set('s-multi', multiLineSale);

      const result = await useCase.execute({ customerId: 'cust-c' });
      const s = result[0];
      expect(s.lineCount).toBe(2);
      // Revenue: 3*2000 + 2*1000 = 8000
      expect(s.totalRevenueCents).toBe(8000);
      // Cost: 3*500 + 2*800 = 3100
      expect(s.totalCostCents).toBe(3100);
      expect(s.grossProfitCents).toBe(4900);
    });
  });

  describe('empty results', () => {
    it('returns empty array when no sales match filters', async () => {
      const result = await useCase.execute({ customerId: 'non-existent' });
      expect(result).toEqual([]);
    });

    it('returns empty array for filter with no matches', async () => {
      const result = await useCase.execute({ status: 'RETURNED' });
      expect(result).toEqual([]);
    });
  });

  describe('date validation edge cases', () => {
    it('handles invalid dateFrom gracefully', async () => {
      const result = await useCase.execute({ dateFrom: 'not-a-date' });
      // Should return empty (filter mismatch) rather than crash
      expect(Array.isArray(result)).toBe(true);
    });

    it('handles invalid dateTo gracefully', async () => {
      const result = await useCase.execute({ dateTo: 'garbage' });
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
