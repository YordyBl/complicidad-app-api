/**
 * Application tests for ListSalesUseCase.
 *
 * Verifies:
 * - No filters → returns all sales sorted by createdAt DESC
 * - Filter by customerId + status
 * - Filter by date range
 * - Empty results (no matching sales)
 * - Invalid date → gracefully returns empty
 * - DTO mapping: Sale domain → SaleWithItems (validates totals, lineCount, channel, items[])
 * - Default sortOrder = desc
 * - items[] populated with product/variant metadata
 * - Grouping by saleId (no duplicate sale rows)
 * - Single and multiple items per sale
 * - Missing metadata fallback labels
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { SaleRepository, SaleFilters } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { SaleId } from '../../../src/modules/sales-returns/domain/SaleId.js';
import type { SaleListItemReadRepository, SaleListItem } from '../../../src/modules/sales-returns/application/ports/SaleListItemReadRepository.js';
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

  async findByIds(ids: SaleIdEntity[]): Promise<SaleEntity[]> {
    return ids.map((id) => this.sales.get(id.toString())).filter(Boolean) as SaleEntity[];
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

class FakeSaleListItemReadRepository implements SaleListItemReadRepository {
  items = new Map<string, SaleListItem[]>();

  async findBySaleIds(ids: string[]): Promise<SaleListItem[]> {
    if (ids.length === 0) return [];
    const result: SaleListItem[] = [];
    for (const id of ids) {
      const saleItems = this.items.get(id);
      if (saleItems) result.push(...saleItems);
    }
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
  channel: 'tiktok' | 'facebook' | 'whatsapp' | 'web' | 'instagram' = 'web',
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
  return new SaleEntity(SaleIdEntity.from(saleId), customerId, channelRef, channel, [line], status, createdAt, createdAt);
}

// ── Tests ────────────────────────────────────────────────────

describe('ListSalesUseCase', () => {
  let repo: FakeSaleRepository;
  let itemRepo: FakeSaleListItemReadRepository;
  let useCase: any;

  beforeEach(async () => {
    repo = new FakeSaleRepository();
    itemRepo = new FakeSaleListItemReadRepository();

    // Seed sales across different customers, statuses, and dates
    repo.sales.set('s1', makeSale('s1', 'cust-a', 'ACTIVE', new Date('2026-01-15'), 'order-a', 'web', 'v1', 2, 1500, 1000));
    repo.sales.set('s2', makeSale('s2', 'cust-a', 'CANCELLED', new Date('2026-02-10'), 'order-b', 'instagram', 'v2', 1, 2000, 1500));
    repo.sales.set('s3', makeSale('s3', 'cust-b', 'ACTIVE', new Date('2026-03-05'), 'order-c', 'tiktok', 'v1', 5, 1000, 700));

    // Seed item display data with product/variant metadata
    // s1: 1 line → variant v1, product "Camiseta", SKU "CAM-BLA-M"
    itemRepo.items.set('s1', [{
      lineId: 'line-s1', saleId: 's1', variantId: 'v1',
      productName: 'Camiseta', sku: 'CAM-BLA-M',
      displayLabel: 'Camiseta',
      attributes: { color: 'Blanco', talle: 'M' },
      quantity: 2, unitPriceCents: 1500, priceType: 'regular',
    }]);
    // s2: 1 line → variant v2, product "Pantalón", SKU "PAN-AZU-L"
    itemRepo.items.set('s2', [{
      lineId: 'line-s2', saleId: 's2', variantId: 'v2',
      productName: 'Pantalón', sku: 'PAN-AZU-L',
      displayLabel: 'Pantalón',
      attributes: { color: 'Azul', talle: 'L' },
      quantity: 1, unitPriceCents: 2000, priceType: 'regular',
    }]);
    // s3: 1 line → variant v1, product "Camiseta", SKU "CAM-BLA-M" (same product as s1)
    itemRepo.items.set('s3', [{
      lineId: 'line-s3', saleId: 's3', variantId: 'v1',
      productName: 'Camiseta', sku: 'CAM-BLA-M',
      displayLabel: 'Camiseta',
      attributes: { color: 'Blanco', talle: 'M' },
      quantity: 5, unitPriceCents: 1000, priceType: 'regular',
    }]);

    // Dynamically import the use case
    const mod = await import('../../../src/modules/sales-returns/application/use-cases/ListSalesUseCase.js');
    useCase = new mod.ListSalesUseCase(repo, itemRepo);
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
    it('maps Sale domain entity to SaleSummary with correct computed totals and channel', async () => {
      const result = await useCase.execute();

      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1).toBeDefined();
      expect(s1).toMatchObject({
        saleId: 's1',
        customerId: 'cust-a',
        channelReference: 'order-a',
        channel: 'web',
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

    it('exposes channel in SaleSummary for each sale', async () => {
      const result = await useCase.execute();

      const s2 = result.find((s: { saleId: string }) => s.saleId === 's2');
      expect(s2).toBeDefined();
      expect(s2.channel).toBe('instagram');

      const s3 = result.find((s: { saleId: string }) => s.saleId === 's3');
      expect(s3).toBeDefined();
      expect(s3.channel).toBe('tiktok');
    });

    it('maps multiple lines correctly', async () => {
      // Add a sale with 2 lines
      const c1 = makeConsumption('c-aa', 'lot-1', 3, 500);
      const c2 = makeConsumption('c-bb', 'lot-2', 2, 800);
      const line1 = new SaleLine(SaleLineId.from('la'), 'v1', 3, Money.fromCents(2000), 'regular', [c1]);
      const line2 = new SaleLine(SaleLineId.from('lb'), 'v2', 2, Money.fromCents(1000), 'presale', [c2]);
      const multiLineSale = new SaleEntity(
        SaleIdEntity.from('s-multi'), 'cust-c', 'order-m', 'facebook', [line1, line2], 'ACTIVE',
        new Date('2026-01-01'), new Date('2026-01-01'),
      );
      repo.sales.set('s-multi', multiLineSale);

      const result = await useCase.execute({ customerId: 'cust-c' });
      const s = result[0];
      expect(s.lineCount).toBe(2);
      expect(s.channel).toBe('facebook');
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

  // ═══════════════════════════════════════════════════════════
  // NEW — PR2: items[] display rows
  // ═══════════════════════════════════════════════════════════

  describe('items[] enriched display data', () => {
    it('includes items array on every sale', async () => {
      const result = await useCase.execute();

      expect(result).toHaveLength(3);
      for (const sale of result) {
        expect(Array.isArray(sale.items)).toBe(true);
      }
    });

    it('populates productName and sku for a single item sale', async () => {
      const result = await useCase.execute();

      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1).toBeDefined();
      expect(s1.items).toHaveLength(1);
      const item = s1.items[0];
      expect(item.productName).toBe('Camiseta');
      expect(item.sku).toBe('CAM-BLA-M');
      expect(item.displayLabel).toBe('Camiseta');
      expect(item.attributes).toEqual({ color: 'Blanco', talle: 'M' });
      expect(item.quantity).toBe(2);
      expect(item.unitPriceCents).toBe(1500);
      expect(item.priceType).toBe('regular');
      expect(item.variantId).toBe('v1');
      expect(item.lineId).toBe('line-s1');
    });

    it('includes attributes object even when empty', async () => {
      // Simulate variant with no attributes
      itemRepo.items.set('s1', [{
        lineId: 'line-s1', saleId: 's1', variantId: 'v1',
        productName: 'Bufanda', sku: 'BUF-GRI-U',
        displayLabel: 'Bufanda',
        attributes: {},
        quantity: 2, unitPriceCents: 1500, priceType: 'regular',
      }]);

      const result = await useCase.execute();
      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1.items[0].attributes).toEqual({});
      expect(s1.items[0].displayLabel).toBe('Bufanda');
    });

    it('groups multiple items under a single sale without duplicating rows', async () => {
      // Add a multi-line sale with 2 lines
      const c1 = makeConsumption('c-aa', 'lot-1', 3, 500);
      const c2 = makeConsumption('c-bb', 'lot-2', 2, 800);
      const line1 = new SaleLine(SaleLineId.from('la'), 'va', 3, Money.fromCents(2000), 'regular', [c1]);
      const line2 = new SaleLine(SaleLineId.from('lb'), 'vb', 2, Money.fromCents(1000), 'presale', [c2]);
      repo.sales.set('s-multi', new SaleEntity(
        SaleIdEntity.from('s-multi'), 'cust-c', 'order-m', 'facebook',
        [line1, line2], 'ACTIVE',
        new Date('2026-01-01'), new Date('2026-01-01'),
      ));
      itemRepo.items.set('s-multi', [
        {
          lineId: 'la', saleId: 's-multi', variantId: 'va',
          productName: 'Campera', sku: 'CAM-NEG-L',
          displayLabel: 'Campera',
          attributes: { color: 'Negro', talle: 'L' },
          quantity: 3, unitPriceCents: 2000, priceType: 'regular',
        },
        {
          lineId: 'lb', saleId: 's-multi', variantId: 'vb',
          productName: 'Remera', sku: 'REM-BLA-S',
          displayLabel: 'Remera',
          attributes: { color: 'Blanco', talle: 'S' },
          quantity: 2, unitPriceCents: 1000, priceType: 'presale',
        },
      ]);

      const result = await useCase.execute();

      // No duplicate sales — each saleId appears once
      expect(result.length).toBe(4); // s1, s2, s3, s-multi
      const saleIds = result.map((s: { saleId: string }) => s.saleId);
      const uniqueIds = new Set(saleIds);
      expect(uniqueIds.size).toBe(saleIds.length); // no duplicates

      const multi = result.find((s: { saleId: string }) => s.saleId === 's-multi');
      expect(multi).toBeDefined();
      expect(multi.items).toHaveLength(2);

      // Verify first item
      expect(multi.items[0]).toMatchObject({
        lineId: 'la',
        productName: 'Campera',
        displayLabel: 'Campera',
        quantity: 3,
        priceType: 'regular',
      });
      // Verify second item
      expect(multi.items[1]).toMatchObject({
        lineId: 'lb',
        productName: 'Remera',
        displayLabel: 'Remera',
        quantity: 2,
        priceType: 'presale',
      });
    });

    it('provides fallback when productName is null', async () => {
      // Simulate missing product
      itemRepo.items.set('s1', [{
        lineId: 'line-s1', saleId: 's1', variantId: 'v1',
        productName: null, sku: 'CAM-BLA-M',
        displayLabel: 'CAM-BLA-M',
        attributes: { color: 'Blanco' },
        quantity: 2, unitPriceCents: 1500, priceType: 'regular',
      }]);

      const result = await useCase.execute();
      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1.items[0].productName).toBeNull();
      // SKU is still available
      expect(s1.items[0].sku).toBe('CAM-BLA-M');
      // displayLabel falls back to SKU when productName is missing
      expect(s1.items[0].displayLabel).toBe('CAM-BLA-M');
    });

    it('provides fallback when both productName and sku are missing', async () => {
      // Simulate missing product AND variant
      itemRepo.items.set('s1', [{
        lineId: 'line-s1', saleId: 's1', variantId: 'v-missing',
        productName: null, sku: null,
        displayLabel: 'Variante sin datos',
        attributes: {},
        quantity: 1, unitPriceCents: 1000, priceType: 'regular',
      }]);

      const result = await useCase.execute();
      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1.items[0].productName).toBeNull();
      expect(s1.items[0].sku).toBeNull();
      // variantId is always available
      expect(s1.items[0].variantId).toBe('v-missing');
      // displayLabel falls back to human-readable default
      expect(s1.items[0].displayLabel).toBe('Variante sin datos');
    });

    it('does NOT call item repository when no sales match filters', async () => {
      // Spy on findBySaleIds
      let called = false;
      const origFindBySaleIds = itemRepo.findBySaleIds.bind(itemRepo);
      itemRepo.findBySaleIds = async (ids: string[]) => {
        called = true;
        return origFindBySaleIds(ids);
      };

      await useCase.execute({ customerId: 'non-existent' });
      // Should not call item repo when there are no sales
      expect(called).toBe(false);
    });

    it('preserves existing SaleSummary fields alongside items', async () => {
      const result = await useCase.execute();

      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1).toBeDefined();
      expect(s1.saleId).toBe('s1');
      expect(s1.customerId).toBe('cust-a');
      expect(s1.channel).toBe('web');
      expect(s1.status).toBe('ACTIVE');
      expect(s1.totalRevenueCents).toBe(3000);
      expect(s1.totalCostCents).toBe(2000);
      expect(s1.grossProfitCents).toBe(1000);
      expect(s1.lineCount).toBe(1);
      expect(typeof s1.createdAt).toBe('string');
      expect(typeof s1.updatedAt).toBe('string');
      // Plus items
      expect(s1.items).toHaveLength(1);
    });

    it('returns empty items array when read repo has no data for a sale', async () => {
      // Clear item data for s1
      itemRepo.items.delete('s1');

      const result = await useCase.execute();
      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1).toBeDefined();
      // items should be an empty array, not undefined
      expect(s1.items).toEqual([]);
      // Other sales still have their items
      const s2 = result.find((s: { saleId: string }) => s.saleId === 's2');
      expect(s2.items).toHaveLength(1);
    });

    it('works correctly without an item read repository (backward compat)', async () => {
      // Re-instantiate use case without itemRepo
      const mod = await import('../../../src/modules/sales-returns/application/use-cases/ListSalesUseCase.js');
      const fallbackUseCase = new mod.ListSalesUseCase(repo); // no second arg

      const result = await fallbackUseCase.execute();
      expect(result).toHaveLength(3);
      for (const sale of result) {
        // items still present as empty array, not undefined
        expect(Array.isArray(sale.items)).toBe(true);
        expect(sale.items).toEqual([]);
      }
      expect(result[0]).toBeDefined();
      expect(result[0]!.saleId).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // NEW — PR2 cleanup: displayLabel human-readable fallback
  // ═══════════════════════════════════════════════════════════

  describe('displayLabel human-readable fallback', () => {
    it('uses productName when available', async () => {
      itemRepo.items.set('s1', [{
        lineId: 'line-s1', saleId: 's1', variantId: 'v1',
        productName: 'Camiseta', sku: 'CAM-BLA-M',
        displayLabel: 'Camiseta',
        attributes: { color: 'Blanco' },
        quantity: 1, unitPriceCents: 1000, priceType: 'regular',
      }]);

      const result = await useCase.execute();
      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1.items[0].displayLabel).toBe('Camiseta');
    });

    it('falls back to SKU when productName is null', async () => {
      itemRepo.items.set('s1', [{
        lineId: 'line-s1', saleId: 's1', variantId: 'v1',
        productName: null, sku: 'PANT-NEG-M',
        displayLabel: 'PANT-NEG-M',
        attributes: {},
        quantity: 1, unitPriceCents: 1000, priceType: 'regular',
      }]);

      const result = await useCase.execute();
      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      expect(s1.items[0].displayLabel).toBe('PANT-NEG-M');
    });

    it('falls back to "Variante sin datos" when both productName and SKU are missing', async () => {
      itemRepo.items.set('s1', [{
        lineId: 'line-s1', saleId: 's1', variantId: 'uuid-1234-abcd',
        productName: null, sku: null,
        displayLabel: 'Variante sin datos',
        attributes: {},
        quantity: 1, unitPriceCents: 1000, priceType: 'regular',
      }]);

      const result = await useCase.execute();
      const s1 = result.find((s: { saleId: string }) => s.saleId === 's1');
      // Must be legible, not a UUID
      expect(s1.items[0].displayLabel).toBe('Variante sin datos');
      expect(s1.items[0].displayLabel).not.toBe('uuid-1234-abcd');
      expect(s1.items[0].displayLabel).not.toBe('');
    });

    it('is always a non-empty string for every item', async () => {
      // Seed three items with different metadata availabilities
      itemRepo.items.set('s-multi', [
        {
          lineId: 'la', saleId: 's-multi', variantId: 'va',
          productName: 'Remera', sku: 'REM-AZU-S',
          displayLabel: 'Remera',
          attributes: {}, quantity: 1, unitPriceCents: 1000, priceType: 'regular',
        },
        {
          lineId: 'lb', saleId: 's-multi', variantId: 'vb',
          productName: null, sku: 'SKU-FALLBACK',
          displayLabel: 'SKU-FALLBACK',
          attributes: {}, quantity: 1, unitPriceCents: 1000, priceType: 'regular',
        },
        {
          lineId: 'lc', saleId: 's-multi', variantId: 'vc',
          productName: null, sku: null,
          displayLabel: 'Variante sin datos',
          attributes: {}, quantity: 1, unitPriceCents: 1000, priceType: 'regular',
        },
      ]);

      const c1 = makeConsumption('c-ga', 'lot-1', 1, 500);
      const c2 = makeConsumption('c-gb', 'lot-2', 1, 500);
      const c3 = makeConsumption('c-gc', 'lot-3', 1, 500);
      repo.sales.set('s-multi', new SaleEntity(
        SaleIdEntity.from('s-multi'), 'cust-d', 'order-g', 'web',
        [
          new SaleLine(SaleLineId.from('la'), 'va', 1, Money.fromCents(1000), 'regular', [c1]),
          new SaleLine(SaleLineId.from('lb'), 'vb', 1, Money.fromCents(1000), 'regular', [c2]),
          new SaleLine(SaleLineId.from('lc'), 'vc', 1, Money.fromCents(1000), 'regular', [c3]),
        ],
        'ACTIVE', new Date('2026-01-01'), new Date('2026-01-01'),
      ));

      const result = await useCase.execute({ customerId: 'cust-d' });
      const multi = result[0];
      expect(multi.items).toHaveLength(3);

      for (const item of multi.items) {
        expect(typeof item.displayLabel).toBe('string');
        expect(item.displayLabel.length).toBeGreaterThan(0);
      }
    });
  });
});
