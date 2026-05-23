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
import type {
  SaleListReadRepository,
  SaleListQuery,
  SaleListRow,
  SaleListPage,
} from '../../../src/modules/sales-returns/application/ports/SaleListReadRepository.js';
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

// ═══════════════════════════════════════════════════════════
// Phase 4 — Paginated SaleListReadRepository path
// ═══════════════════════════════════════════════════════════

class FakeSaleListReadRepository implements SaleListReadRepository {
  rows: SaleListRow[] = [];

  async query(query: SaleListQuery): Promise<SaleListPage> {
    let filtered = [...this.rows];

    // Filter by status
    if (query.status) {
      filtered = filtered.filter((r) => r.status === query.status);
    }
    // Filter by paymentStatus
    if (query.paymentStatus) {
      filtered = filtered.filter((r) => r.paymentStatus === query.paymentStatus);
    }
    // Search by customer name
    if (query.search) {
      const term = query.search.toLowerCase();
      filtered = filtered.filter((r) => r.customerName.toLowerCase().includes(term));
    }
    // Date from
    if (query.dateFrom) {
      const from = new Date(query.dateFrom);
      filtered = filtered.filter((r) => new Date(r.createdAt) >= from);
    }
    // Date to (end of day)
    if (query.dateTo) {
      const toRaw = new Date(query.dateTo);
      const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999);
      filtered = filtered.filter((r) => new Date(r.createdAt) <= to);
    }

    // Sort
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    filtered.sort((a, b) => {
      let valA: number;
      let valB: number;
      switch (sortBy) {
        case 'totalRevenueCents': valA = a.totalRevenueCents; valB = b.totalRevenueCents; break;
        case 'totalCostCents': valA = a.totalCostCents; valB = b.totalCostCents; break;
        case 'grossProfitCents': valA = a.grossProfitCents; valB = b.grossProfitCents; break;
        default: valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); break;
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    // Pagination
    const total = filtered.length;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
    const startIndex = (page - 1) * pageSize;
    const items = filtered.slice(startIndex, startIndex + pageSize);

    return { items, total, page, pageSize, totalPages };
  }
}

function makeSaleListRow(overrides: Partial<SaleListRow> = {}): SaleListRow {
  return {
    saleId: 'row-1',
    customerId: 'cust-a',
    customerName: 'Cliente A',
    channelReference: 'ref-1',
    channel: 'web',
    status: 'ACTIVE',
    paymentStatus: 'paid',
    amountPaidCents: 3000,
    pendingBalanceCents: 0,
    totalRevenueCents: 3000,
    totalCostCents: 2000,
    grossProfitCents: 1000,
    lineCount: 1,
    settledAt: null,
    canSettleBalance: false,
    createdAt: '2026-05-15T10:00:00.000Z',
    updatedAt: '2026-05-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('ListSalesUseCase — paginated read model', () => {
  let repo: FakeSaleRepository;
  let itemRepo: FakeSaleListItemReadRepository;
  let listRepo: FakeSaleListReadRepository;
  let useCase: any;

  beforeEach(async () => {
    repo = new FakeSaleRepository();
    itemRepo = new FakeSaleListItemReadRepository();
    listRepo = new FakeSaleListReadRepository();

    // Seed list repo rows
    listRepo.rows = [
      makeSaleListRow({ saleId: 's1', customerName: 'Cliente A', grossProfitCents: 1000, totalRevenueCents: 3000, createdAt: '2026-01-15T10:00:00.000Z', paymentStatus: 'paid', amountPaidCents: 3000, pendingBalanceCents: 0, canSettleBalance: false }),
      makeSaleListRow({ saleId: 's2', customerName: 'Cliente B', grossProfitCents: 500, totalRevenueCents: 2000, createdAt: '2026-02-10T10:00:00.000Z', paymentStatus: 'paid', amountPaidCents: 2000, pendingBalanceCents: 0 }),
      makeSaleListRow({ saleId: 's3', customerName: 'Cliente C', grossProfitCents: 1500, totalRevenueCents: 3000, createdAt: '2026-03-05T10:00:00.000Z', paymentStatus: 'partial', amountPaidCents: 1000, pendingBalanceCents: 2000, canSettleBalance: true }),
      makeSaleListRow({ saleId: 's4', customerName: 'Cliente D', grossProfitCents: 2000, totalRevenueCents: 5000, createdAt: '2026-03-10T10:00:00.000Z', paymentStatus: 'pending', amountPaidCents: 0, pendingBalanceCents: 5000, canSettleBalance: true }),
      makeSaleListRow({ saleId: 's5', customerName: 'Z-Cliente', grossProfitCents: 800, totalRevenueCents: 4000, createdAt: '2026-04-01T10:00:00.000Z', paymentStatus: 'paid', amountPaidCents: 4000, pendingBalanceCents: 0 }),
    ];

    // Seed matching items
    for (const row of listRepo.rows) {
      itemRepo.items.set(row.saleId, [{
        lineId: `line-${row.saleId}`, saleId: row.saleId, variantId: 'v1',
        productName: 'Producto', sku: 'SKU-001',
        displayLabel: 'Producto',
        attributes: {}, quantity: 1, unitPriceCents: row.totalRevenueCents, priceType: 'regular',
      }]);
    }

    const mod = await import('../../../src/modules/sales-returns/application/use-cases/ListSalesUseCase.js');
    useCase = new mod.ListSalesUseCase(repo, itemRepo, listRepo);
  });

  describe('executePaginated', () => {
    it('returns paginated response with metadata', async () => {
      const result = await useCase.executePaginated({ page: 1, pageSize: 2 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
      expect(result).toHaveProperty('totalPages');

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.totalPages).toBe(3);
    });

    it('defaults to createdAt DESC ordering', async () => {
      const result = await useCase.executePaginated({ pageSize: 50 });

      // Newest first: s5 (Apr 1), s4 (Mar 10), s3 (Mar 5), s2 (Feb 10), s1 (Jan 15)
      expect(result.items[0].saleId).toBe('s5');
      expect(result.items[1].saleId).toBe('s4');
      expect(result.items[4].saleId).toBe('s1');
    });

    it('sorts by grossProfitCents desc', async () => {
      const result = await useCase.executePaginated({ sortBy: 'grossProfitCents', sortOrder: 'desc', pageSize: 50 });

      // Desc by profit: s4 (2000), s3 (1500), s1 (1000), s5 (800), s2 (500)
      expect(result.items[0].saleId).toBe('s4');
      expect(result.items[1].saleId).toBe('s3');
      expect(result.items[2].saleId).toBe('s1');
      expect(result.items[3].saleId).toBe('s5');
      expect(result.items[4].saleId).toBe('s2');
    });

    it('sorts by totalRevenueCents asc', async () => {
      // Revenue: s1=3000, s2=2000, s3=3000, s4=5000, s5=4000
      // Asc: s2 (2000), s1 (3000), s3 (3000), s5 (4000), s4 (5000)
      const result = await useCase.executePaginated({ sortBy: 'totalRevenueCents', sortOrder: 'asc', pageSize: 50 });

      expect(result.items[0].saleId).toBe('s2');
      expect(result.items[4].saleId).toBe('s4');
    });

    it('filters by paymentStatus', async () => {
      const result = await useCase.executePaginated({ paymentStatus: 'pending', pageSize: 50 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].saleId).toBe('s4');
    });

    it('filters by status', async () => {
      // None are CANCELLED yet, but we can test with ACTIVE
      const result = await useCase.executePaginated({ status: 'ACTIVE', pageSize: 50 });

      expect(result.total).toBe(5);
    });

    it('searches by customer name', async () => {
      const result = await useCase.executePaginated({ search: 'Cliente C', pageSize: 50 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].saleId).toBe('s3');
    });

    it('searches case-insensitively', async () => {
      const result = await useCase.executePaginated({ search: 'cliente', pageSize: 50 });

      // Matches all rows that have "cliente" in the name (Z-Cliente also matches)
      expect(result.total).toBe(5);
    });

    it('filters by date range', async () => {
      const result = await useCase.executePaginated({ dateFrom: '2026-02-01', dateTo: '2026-03-31', pageSize: 50 });

      expect(result.items).toHaveLength(3); // s2 (Feb 10), s3 (Mar 5), s4 (Mar 10)
      expect(result.items.map((i: SaleListRow) => i.saleId)).toEqual(['s4', 's3', 's2']); // Desc by date
    });

    it('includes customerName in every row', async () => {
      const result = await useCase.executePaginated({ pageSize: 50 });

      for (const item of result.items) {
        expect(typeof item.customerName).toBe('string');
        expect(item.customerName.length).toBeGreaterThan(0);
      }
    });

    it('includes payment fields in every row', async () => {
      const result = await useCase.executePaginated({ pageSize: 50 });

      for (const item of result.items) {
        expect(item).toHaveProperty('paymentStatus');
        expect(item).toHaveProperty('amountPaidCents');
        expect(item).toHaveProperty('pendingBalanceCents');
        expect(item).toHaveProperty('canSettleBalance');
        expect(typeof item.paymentStatus).toBe('string');
        expect(typeof item.amountPaidCents).toBe('number');
        expect(typeof item.pendingBalanceCents).toBe('number');
        expect(typeof item.canSettleBalance).toBe('boolean');
      }
    });

    it('sets canSettleBalance true for pending/partial, false for paid', async () => {
      const result = await useCase.executePaginated({ pageSize: 50 });

      const s1 = result.items.find((i: SaleListRow) => i.saleId === 's1');
      expect(s1.canSettleBalance).toBe(false); // paid

      const s3 = result.items.find((i: SaleListRow) => i.saleId === 's3');
      expect(s3.canSettleBalance).toBe(true); // partial

      const s4 = result.items.find((i: SaleListRow) => i.saleId === 's4');
      expect(s4.canSettleBalance).toBe(true); // pending
    });

    it('includes items array on every row', async () => {
      const result = await useCase.executePaginated({ pageSize: 50 });

      for (const item of result.items) {
        expect(Array.isArray(item.items)).toBe(true);
      }
    });

    it('returns empty results for no matches', async () => {
      const result = await useCase.executePaginated({ search: 'nonexistent', pageSize: 50 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(1);
    });

    it('supports pagination second page', async () => {
      const result = await useCase.executePaginated({ page: 2, pageSize: 2 });

      // 5 total, pageSize 2: page 1 = s5, s4; page 2 = s3, s2; page 3 = s1
      expect(result.items).toHaveLength(2);
      expect(result.items[0].saleId).toBe('s3');
      expect(result.items[1].saleId).toBe('s2');
      expect(result.total).toBe(5);
    });
  });
});
