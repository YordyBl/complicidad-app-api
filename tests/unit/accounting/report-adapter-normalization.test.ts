/**
 * Adapter-level tests for raw DB aggregate normalization through the boundary.
 *
 * Exercises the full path: raw DB outputs (string|number|null) → adapter
 * methods → normalized integer cents. Proves the infrastructure boundary
 * wiring works end-to-end using a mocked EntityManager.
 *
 * Extended with paginated list queries and search filtering tests for
 * stock-by-product and lots.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ReportQueryAdapter,
} from '../../../src/modules/accounting-reports/infrastructure/typeorm/ReportQueryAdapter.js';
import type { EntityManager } from 'typeorm';
import type { ReportListQuery } from '../../../src/modules/accounting-reports/domain/ReportReadRepository.js';

/**
 * Build a minimal mock EntityManager that returns pre-configured
 * raw rows from getRawMany() and getRawOne().
 *
 * For paginated methods (getStockByProduct, getLots), use
 * mockPaginatedManager defined below.
 */
function mockManager(opts: {
  stockByProductRows?: Record<string, unknown>[];
  lotRows?: Record<string, unknown>[];
  rawOneValue?: Record<string, unknown> | null;
}): EntityManager {
  const builder = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    addGroupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getRawMany: vi.fn().mockResolvedValue(
      opts.stockByProductRows ?? opts.lotRows ?? [],
    ),
    getRawOne: vi.fn().mockResolvedValue(
      opts.rawOneValue ?? null,
    ),
  };

  return {
    createQueryBuilder: vi.fn(() => builder),
  } as unknown as EntityManager;
}

describe('ReportQueryAdapter — boundary normalization', () => {
  const defaultQuery: ReportListQuery = { page: 1, pageSize: 10, search: '' };

  describe('getStockByProduct', () => {
    it('normalizes string investment_cents to integer cents', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '2' },
          dataRows: [
            {
              product_id: 'p1',
              product_name: 'Product A',
              variant_id: 'v1',
              variant_name: 'Variant A',
              sku: 'SKU-A',
              total_remaining_qty: '10',
              investment_cents: '50000',
            },
            {
              product_id: 'p2',
              product_name: 'Product B',
              variant_id: 'v2',
              variant_name: 'Variant B',
              sku: 'SKU-B',
              total_remaining_qty: '5',
              investment_cents: '25000',
            },
          ],
        }),
      );

      const result = await adapter.getStockByProduct(defaultQuery);

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.investmentCents).toBe(50000);
      expect(result.items[1]!.investmentCents).toBe(25000);
    });

    it('normalizes float string investment_cents rounding to integer', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              product_id: 'p1',
              product_name: 'P',
              variant_id: 'v1',
              variant_name: 'V1',
              sku: 'SKU1',
              total_remaining_qty: '3',
              investment_cents: '100.7',
            },
          ],
        }),
      );

      const result = await adapter.getStockByProduct(defaultQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.investmentCents).toBe(101);
    });

    it('handles null investment_cents as zero', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              product_id: 'p1',
              product_name: 'P',
              variant_id: 'v1',
              variant_name: 'V1',
              sku: 'SKU1',
              total_remaining_qty: '0',
              investment_cents: null,
            },
          ],
        }),
      );

      const result = await adapter.getStockByProduct(defaultQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.investmentCents).toBe(0);
    });

    it('handles numeric investment_cents directly', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              product_id: 'p1',
              product_name: 'P',
              variant_id: 'v1',
              variant_name: 'V1',
              sku: 'SKU1',
              total_remaining_qty: '7',
              investment_cents: 75000,
            },
          ],
        }),
      );

      const result = await adapter.getStockByProduct(defaultQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.investmentCents).toBe(75000);
    });
  });

  describe('getLots', () => {
    it('normalizes string unit_cost_cents to integer cents', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              lot_id: 'lot-1',
              variant_id: 'v1',
              sku: 'SKU-001',
              product_name: 'Test Product',
              purchase_date: new Date('2026-01-01'),
              purchased_quantity: '100',
              remaining_quantity: '30',
              unit_cost_cents: '500',
            },
          ],
        }),
      );

      const result = await adapter.getLots(defaultQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.unitCostCents).toBe(500);
    });

    it('normalizes float string unit_cost_cents rounding', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              lot_id: 'lot-1',
              variant_id: 'v1',
              sku: 'SKU-001',
              product_name: 'P',
              purchase_date: new Date('2026-01-01'),
              purchased_quantity: '50',
              remaining_quantity: '20',
              unit_cost_cents: '499.6',
            },
          ],
        }),
      );

      const result = await adapter.getLots(defaultQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.unitCostCents).toBe(500);
    });

    it('handles null unit_cost_cents as zero', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              lot_id: 'lot-1',
              variant_id: 'v1',
              sku: 'SKU-001',
              product_name: 'P',
              purchase_date: new Date('2026-01-01'),
              purchased_quantity: '0',
              remaining_quantity: '0',
              unit_cost_cents: null,
            },
          ],
        }),
      );

      const result = await adapter.getLots(defaultQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.unitCostCents).toBe(0);
    });
  });

  describe('getRawOne aggregates — getLiquidityCents', () => {
    it('normalizes string total from raw DB aggregate', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({ rawOneValue: { total: '250000' } }),
      );

      const result = await adapter.getLiquidityCents();

      expect(result).toBe(250000);
    });

    it('normalizes float string total rounding to integer', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({ rawOneValue: { total: '100.7' } }),
      );

      const result = await adapter.getLiquidityCents();

      expect(result).toBe(101);
    });

    it('returns zero when getRawOne returns null (no entries)', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({ rawOneValue: null }),
      );

      const result = await adapter.getLiquidityCents();

      expect(result).toBe(0);
    });

    it('preserves negative liquidity (overdrawn)', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({ rawOneValue: { total: '-50000' } }),
      );

      const result = await adapter.getLiquidityCents();

      expect(result).toBe(-50000);
    });

    it('handles numeric total directly', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({ rawOneValue: { total: 300000 } }),
      );

      const result = await adapter.getLiquidityCents();

      expect(result).toBe(300000);
    });
  });

  describe('getRawOne aggregates — getStockInvestmentCents', () => {
    it('normalizes string total from raw DB aggregate', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({ rawOneValue: { total: '175000' } }),
      );

      const result = await adapter.getStockInvestmentCents();

      expect(result).toBe(175000);
    });

    it('returns zero when no stock exists (null result)', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({ rawOneValue: null }),
      );

      const result = await adapter.getStockInvestmentCents();

      expect(result).toBe(0);
    });

    it('handles numeric total for stock investment', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({ rawOneValue: { total: 425000 } }),
      );

      const result = await adapter.getStockInvestmentCents();

      expect(result).toBe(425000);
    });
  });
});

// ── Paginated list query tests ─────────────────────────────────

/**
 * Build a mock EntityManager that can sequence getRawOne calls
 * (first: count query, second: data query for stock-by-product).
 */
function mockPaginatedManager(opts: {
  countRows?: Record<string, unknown> | null;
  dataRows?: Record<string, unknown>[];
}): EntityManager {
  const getRawMany = vi.fn().mockResolvedValue(opts.dataRows ?? []);
  const getRawOneSequence = [opts.countRows ?? null];
  const getRawOne = vi.fn().mockImplementation(() =>
    Promise.resolve(getRawOneSequence.shift() ?? null),
  );

  const builder = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    addGroupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getRawMany,
    getRawOne,
  };

  return {
    createQueryBuilder: vi.fn(() => builder),
  } as unknown as EntityManager;
}

describe('ReportQueryAdapter — paginated list queries', () => {
  const defaultQuery: ReportListQuery = { page: 1, pageSize: 5, search: '' };

  describe('getStockByProduct (paginated)', () => {
    it('returns paginated envelope with metadata', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '12' },
          dataRows: [
            {
              product_id: 'p1',
              product_name: 'Product A',
              variant_id: 'v1',
              variant_name: 'Variant A',
              sku: 'SKU-A',
              total_remaining_qty: '5',
              investment_cents: '25000',
            },
          ],
        }),
      );

      const result = await adapter.getStockByProduct(defaultQuery);

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(5);
      expect(result.totalItems).toBe(12);
      expect(result.totalPages).toBe(3); // ceil(12/5)
      expect(result.search).toBe('');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.investmentCents).toBe(25000);
    });

    it('normalizes investment_cents from string', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              product_id: 'p1',
              product_name: 'P',
              variant_id: 'v1',
              variant_name: 'V1',
              sku: 'SKU1',
              total_remaining_qty: '3',
              investment_cents: '100.7',
            },
          ],
        }),
      );

      const result = await adapter.getStockByProduct(defaultQuery);

      expect(result.items[0]!.investmentCents).toBe(101);
    });

    it('returns empty items and zero totals when no rows', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '0' },
          dataRows: [],
        }),
      );

      const result = await adapter.getStockByProduct(defaultQuery);

      expect(result.totalItems).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('calculates totalPages correctly for exact divisor', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '10' },
          dataRows: [],
        }),
      );

      const result = await adapter.getStockByProduct({ page: 1, pageSize: 5, search: '' });

      expect(result.totalPages).toBe(2); // ceil(10/5)
    });

    it('applies page offset correctly', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '20' },
          dataRows: [
            {
              product_id: 'p3',
              product_name: 'Page 2 Product',
              variant_id: 'v3',
              variant_name: 'V3',
              sku: 'SKU3',
              total_remaining_qty: '1',
              investment_cents: 1000,
            },
          ],
        }),
      );

      const result = await adapter.getStockByProduct({ page: 2, pageSize: 5, search: '' });

      expect(result.page).toBe(2);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.productName).toBe('Page 2 Product');
    });
  });

  describe('getLots (paginated)', () => {
    it('returns paginated lot envelope with unitCostCents', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '3' },
          dataRows: [
            {
              lot_id: 'lot-1',
              variant_id: 'v1',
              sku: 'SKU-001',
              product_name: 'Test Product',
              purchase_date: new Date('2026-01-01'),
              purchased_quantity: '100',
              remaining_quantity: '30',
              unit_cost_cents: '500',
            },
          ],
        }),
      );

      const result = await adapter.getLots(defaultQuery);

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(5);
      expect(result.totalItems).toBe(3);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.unitCostCents).toBe(500);
      expect(result.items[0]!.totalCostCents).toBe(15000); // 30 * 500
      expect(result.items[0]!.status).toBe('OPEN');
    });

    it('marks lot as EXHAUSTED when remainingQuantity is zero', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              lot_id: 'lot-2',
              variant_id: 'v2',
              sku: 'SKU-002',
              product_name: 'Exhausted Item',
              purchase_date: new Date('2025-01-01'),
              purchased_quantity: '50',
              remaining_quantity: '0',
              unit_cost_cents: '300',
            },
          ],
        }),
      );

      const result = await adapter.getLots(defaultQuery);

      expect(result.items[0]!.status).toBe('EXHAUSTED');
      expect(result.items[0]!.remainingQuantity).toBe(0);
      expect(result.items[0]!.totalCostCents).toBe(0);
    });

    it('applies search filter to both count and data queries', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '1' },
          dataRows: [
            {
              lot_id: 'lot-3',
              variant_id: 'v3',
              sku: 'SKU-003',
              product_name: 'Filtered Product',
              purchase_date: new Date('2026-03-01'),
              purchased_quantity: '20',
              remaining_quantity: '10',
              unit_cost_cents: '250',
            },
          ],
        }),
      );

      const result = await adapter.getLots({ page: 1, pageSize: 5, search: 'filtered' });

      expect(result.search).toBe('filtered');
      expect(result.totalItems).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('returns empty items when no matching lots', async () => {
      const adapter = new ReportQueryAdapter(
        mockPaginatedManager({
          countRows: { total: '0' },
          dataRows: [],
        }),
      );

      const result = await adapter.getLots({ page: 1, pageSize: 5, search: 'nonexistent' });

      expect(result.totalItems).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('count query does NOT include ORDER BY (regression guard)', async () => {
      // This test guards against the PostgreSQL error:
      //   "column must appear in the GROUP BY clause or be used
      //    in an aggregate function"
      // which is triggered when ORDER BY columns are present in
      // a COUNT(*) query without GROUP BY.
      //
      // We track separate builders to prove count ≠ data ordering.
      const countOrderBy = vi.fn().mockReturnThis();
      const countAddOrderBy = vi.fn().mockReturnThis();
      const dataOrderBy = vi.fn().mockReturnThis();
      const dataAddOrderBy = vi.fn().mockReturnThis();

      const countBuilder = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: countOrderBy,
        addOrderBy: countAddOrderBy,
        offset: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getRawOne: vi.fn().mockResolvedValue({ total: '5' }),
        getRawMany: vi.fn().mockResolvedValue([]),
      };

      const dataBuilder = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: dataOrderBy,
        addOrderBy: dataAddOrderBy,
        offset: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getRawOne: vi.fn().mockResolvedValue({ total: '5' }),
        getRawMany: vi.fn().mockResolvedValue([]),
      };

      let callIndex = 0;
      const manager = {
        createQueryBuilder: vi.fn(() => {
          callIndex++;
          return callIndex === 1 ? countBuilder : dataBuilder;
        }),
      } as unknown as EntityManager;

      const adapter = new ReportQueryAdapter(manager);
      await adapter.getLots({ page: 1, pageSize: 5, search: '' });

      // COUNT query must NOT have ORDER BY clauses
      expect(countOrderBy).not.toHaveBeenCalled();
      expect(countAddOrderBy).not.toHaveBeenCalled();

      // DATA query MUST have ORDER BY clauses
      expect(dataOrderBy).toHaveBeenCalledWith('l.purchase_date', 'ASC');
      expect(dataAddOrderBy).toHaveBeenCalledWith('l.created_at', 'ASC');
    });
  });
});
