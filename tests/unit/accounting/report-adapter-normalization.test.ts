/**
 * Adapter-level tests for raw DB aggregate normalization through the boundary.
 *
 * Exercises the full path: raw DB outputs (string|number|null) → adapter
 * methods → normalized integer cents. Proves the infrastructure boundary
 * wiring works end-to-end using a mocked EntityManager.
 */
import { describe, it, expect, vi } from 'vitest';
import { ReportQueryAdapter } from '../../../src/modules/accounting-reports/infrastructure/typeorm/ReportQueryAdapter.js';
import type { EntityManager } from 'typeorm';

/**
 * Build a minimal mock EntityManager that returns pre-configured
 * raw rows from getRawMany() and getRawOne().
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
    groupBy: vi.fn().mockReturnThis(),
    addGroupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
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
  describe('getStockByProduct', () => {
    it('normalizes string investment_cents to integer cents', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({
          stockByProductRows: [
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

      const result = await adapter.getStockByProduct();

      expect(result).toHaveLength(2);
      expect(result[0]!.investmentCents).toBe(50000);
      expect(result[1]!.investmentCents).toBe(25000);
    });

    it('normalizes float string investment_cents rounding to integer', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({
          stockByProductRows: [
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

      const result = await adapter.getStockByProduct();

      expect(result).toHaveLength(1);
      expect(result[0]!.investmentCents).toBe(101);
    });

    it('handles null investment_cents as zero', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({
          stockByProductRows: [
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

      const result = await adapter.getStockByProduct();

      expect(result).toHaveLength(1);
      expect(result[0]!.investmentCents).toBe(0);
    });

    it('handles numeric investment_cents directly', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({
          stockByProductRows: [
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

      const result = await adapter.getStockByProduct();

      expect(result).toHaveLength(1);
      expect(result[0]!.investmentCents).toBe(75000);
    });
  });

  describe('getLots', () => {
    it('normalizes string unit_cost_cents to integer cents', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({
          lotRows: [
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

      const result = await adapter.getLots();

      expect(result).toHaveLength(1);
      expect(result[0]!.unitCostCents).toBe(500);
    });

    it('normalizes float string unit_cost_cents rounding', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({
          lotRows: [
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

      const result = await adapter.getLots();

      expect(result).toHaveLength(1);
      expect(result[0]!.unitCostCents).toBe(500);
    });

    it('handles null unit_cost_cents as zero', async () => {
      const adapter = new ReportQueryAdapter(
        mockManager({
          lotRows: [
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

      const result = await adapter.getLots();

      expect(result).toHaveLength(1);
      expect(result[0]!.unitCostCents).toBe(0);
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
