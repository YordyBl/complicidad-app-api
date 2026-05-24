/**
 * Application tests for GetSaleDetailUseCase.
 *
 * Verifies:
 * - Found sale → returns ok(SaleDetailResponse) with lines, consumptions, and channel
 * - Not found sale → returns err(NotFoundError)
 * - DTO shape includes channel, nested line totals and consumption details
 * - Enriched customer fields (name, phone, address, district) when reader is wired
 * - Enriched line display fields (displayLabel, productName, sku, attributes)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { SaleId } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId as SaleIdEntity } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { SaleLine } from '../../../src/modules/sales-returns/domain/SaleLine.js';
import { SaleLineId } from '../../../src/modules/sales-returns/domain/SaleLineId.js';
import { LotConsumptionRecord } from '../../../src/modules/sales-returns/domain/LotConsumptionRecord.js';

// ── Fakes ────────────────────────────────────────────────────

class FakeSaleRepository implements SaleRepository {
  sales = new Map<string, SaleEntity>();

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

  async findAll(): Promise<SaleEntity[]> {
    return Array.from(this.sales.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

class FakeSaleDetailReadRepository {
  private enriched = new Map<string, {
    customerName: string;
    customerPhone: string | null;
    customerAddress: string | null;
    customerDistrict: string | null;
    googleMapsUrl: string | null;
    lines: {
      lineId: string;
      displayLabel: string;
      productName: string | null;
      sku: string | null;
      attributes: Record<string, string>;
    }[];
  }>();

  setEnriched(saleId: string, data: {
    customerName: string;
    customerPhone: string | null;
    customerAddress: string | null;
    customerDistrict: string | null;
    googleMapsUrl: string | null;
    lines: {
      lineId: string;
      displayLabel: string;
      productName: string | null;
      sku: string | null;
      attributes: Record<string, string>;
    }[];
  }) {
    this.enriched.set(saleId, data);
  }

  async findBySaleId(saleId: string): Promise<{
    customerName: string;
    customerPhone: string | null;
    customerAddress: string | null;
    customerDistrict: string | null;
    googleMapsUrl: string | null;
    lines: {
      lineId: string;
      displayLabel: string;
      productName: string | null;
      sku: string | null;
      attributes: Record<string, string>;
    }[];
  } | null> {
    return this.enriched.get(saleId) ?? null;
  }
}

// ── Fixtures ─────────────────────────────────────────────────

function makeConsumption(
  id: string,
  lotId: string,
  qty: number,
  unitCostCents: number,
): LotConsumptionRecord {
  return new LotConsumptionRecord(
    id,
    lotId,
    qty,
    Money.fromCents(unitCostCents),
    Money.fromCents(unitCostCents * qty),
  );
}

function makeSaleWithLines(saleId: string): SaleEntity {
  const c1 = makeConsumption('cons-1', 'lot-a', 3, 500);   // 3 * 500 = 1500
  const c2 = makeConsumption('cons-2', 'lot-b', 2, 800);   // 2 * 800 = 1600
  const line1 = new SaleLine(
    SaleLineId.from('line-1'),
    'variant-a',
    3,
    Money.fromCents(2000),  // unit price
    'regular',
    [c1],
  );
  const line2 = new SaleLine(
    SaleLineId.from('line-2'),
    'variant-b',
    2,
    Money.fromCents(1500),  // unit price
    'presale',
    [c2],
  );

  return new SaleEntity(
    SaleIdEntity.from(saleId),
    'customer-1',
    'web-order-123',
    'web',
    [line1, line2],
    'ACTIVE',
    new Date('2026-03-15T10:00:00.000Z'),
    new Date('2026-03-16T14:30:00.000Z'),
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('GetSaleDetailUseCase', () => {
  let repo: FakeSaleRepository;
  let enrichedRepo: FakeSaleDetailReadRepository;
  let useCase: any;

  beforeEach(async () => {
    repo = new FakeSaleRepository();
    enrichedRepo = new FakeSaleDetailReadRepository();
    repo.sales.set('sale-1', makeSaleWithLines('sale-1'));

    const mod = await import('../../../src/modules/sales-returns/application/use-cases/GetSaleDetailUseCase.js');
    useCase = new mod.GetSaleDetailUseCase(repo, enrichedRepo);
  });

  describe('found sale', () => {
    it('returns ok with full detail DTO including channel', async () => {
      // Prepare enriched data
      enrichedRepo.setEnriched('sale-1', {
        customerName: 'Juan Pérez',
        customerPhone: '+5491123456789',
        customerAddress: 'Av. Corrientes 1234',
        customerDistrict: 'CABA',
        googleMapsUrl: 'https://maps.google.com/?q=Av.+Corrientes+1234',
        lines: [
          {
            lineId: 'line-1',
            displayLabel: 'Camiseta Blanca',
            productName: 'Camiseta',
            sku: 'CAM-BLA-M',
            attributes: { color: 'Blanco', size: 'M' },
          },
          {
            lineId: 'line-2',
            displayLabel: 'Pantalón',
            productName: 'Pantalón',
            sku: 'PAN-NEG-L',
            attributes: { color: 'Negro', size: 'L' },
          },
        ],
      });

      const result = await useCase.execute({ saleId: 'sale-1' });

      expect(result.ok).toBe(true);
      const detail = result.value;

      // Top-level fields
      expect(detail.id).toBe('sale-1');
      expect(detail.customerId).toBe('customer-1');
      expect(detail.channelReference).toBe('web-order-123');
      expect(detail.channel).toBe('web');
      expect(detail.status).toBe('ACTIVE');
      expect(detail.createdAt).toBe('2026-03-15T10:00:00.000Z');
      expect(detail.updatedAt).toBe('2026-03-16T14:30:00.000Z');

      // Enriched customer fields
      expect(detail.customerName).toBe('Juan Pérez');
      expect(detail.customerPhone).toBe('+5491123456789');
      expect(detail.customerAddress).toBe('Av. Corrientes 1234');
      expect(detail.customerDistrict).toBe('CABA');
      expect(detail.googleMapsUrl).toBe('https://maps.google.com/?q=Av.+Corrientes+1234');

      // Computed totals
      // Revenue: 3*2000 + 2*1500 = 9000
      expect(detail.totalRevenueCents).toBe(9000);
      // Cost: 1500 + 1600 = 3100
      expect(detail.totalCostCents).toBe(3100);
      expect(detail.grossProfitCents).toBe(5900);
    });

    it('includes lines with computed totals and display labels', async () => {
      enrichedRepo.setEnriched('sale-1', {
        customerName: 'Juan Pérez',
        customerPhone: null,
        customerAddress: null,
        customerDistrict: null,
        googleMapsUrl: null,
        lines: [
          {
            lineId: 'line-1',
            displayLabel: 'Camiseta Blanca',
            productName: 'Camiseta',
            sku: 'CAM-BLA-M',
            attributes: { color: 'Blanco', size: 'M' },
          },
          {
            lineId: 'line-2',
            displayLabel: 'Variante sin datos',
            productName: null,
            sku: null,
            attributes: {},
          },
        ],
      });

      const result = await useCase.execute({ saleId: 'sale-1' });
      const detail = result.value;

      expect(detail.lines).toHaveLength(2);

      // Line 1: enriched display
      const line1 = detail.lines.find((l: { id: string }) => l.id === 'line-1');
      expect(line1).toBeDefined();
      expect(line1.variantId).toBe('variant-a');
      expect(line1.quantity).toBe(3);
      expect(line1.unitPriceCents).toBe(2000);
      expect(line1.priceType).toBe('regular');
      expect(line1.totalPriceCents).toBe(6000);
      expect(line1.totalCostCents).toBe(1500);
      // Enriched display fields
      expect(line1.displayLabel).toBe('Camiseta Blanca');
      expect(line1.productName).toBe('Camiseta');
      expect(line1.sku).toBe('CAM-BLA-M');
      expect(line1.attributes).toEqual({ color: 'Blanco', size: 'M' });

      // Line 2: fallback display
      const line2 = detail.lines.find((l: { id: string }) => l.id === 'line-2');
      expect(line2).toBeDefined();
      expect(line2.variantId).toBe('variant-b');
      expect(line2.quantity).toBe(2);
      expect(line2.priceType).toBe('presale');
      expect(line2.totalPriceCents).toBe(3000);
      expect(line2.totalCostCents).toBe(1600);
      // Enriched display (fallback case)
      expect(line2.displayLabel).toBe('Variante sin datos');
      expect(line2.productName).toBeNull();
      expect(line2.sku).toBeNull();
      expect(line2.attributes).toEqual({});
    });

    it('includes consumption records inside lines', async () => {
      enrichedRepo.setEnriched('sale-1', {
        customerName: 'Juan Pérez',
        customerPhone: null,
        customerAddress: null,
        customerDistrict: null,
        googleMapsUrl: null,
        lines: [
          { lineId: 'line-1', displayLabel: 'Product A', productName: 'Product A', sku: 'SKU-A', attributes: {} },
          { lineId: 'line-2', displayLabel: 'Product B', productName: 'Product B', sku: 'SKU-B', attributes: {} },
        ],
      });

      const result = await useCase.execute({ saleId: 'sale-1' });
      const detail = result.value;

      const line1 = detail.lines.find((l: { id: string }) => l.id === 'line-1');
      expect(line1.consumptions).toHaveLength(1);

      const cons = line1.consumptions[0];
      expect(cons.id).toBe('cons-1');
      expect(cons.purchaseLotId).toBe('lot-a');
      expect(cons.quantity).toBe(3);
      expect(cons.unitCostCents).toBe(500);
      expect(cons.subtotalCents).toBe(1500);
    });

    it('returns null for enriched fields when reader returns no data', async () => {
      // No enriched data set — the use case should gracefully handle null.
      const result = await useCase.execute({ saleId: 'sale-1' });

      expect(result.ok).toBe(true);
      const detail = result.value;

      expect(detail.customerName).toBeNull();
      expect(detail.customerPhone).toBeNull();
      expect(detail.customerAddress).toBeNull();
      expect(detail.customerDistrict).toBeNull();
      expect(detail.googleMapsUrl).toBeNull();

      // Lines should still exist from aggregate but without display fields
      expect(detail.lines).toHaveLength(2);
      const line1 = detail.lines[0];
      expect(line1.displayLabel).toBeNull();
      expect(line1.productName).toBeNull();
      expect(line1.sku).toBeNull();
      expect(line1.attributes).toEqual({});
    });

    it('does not persist delivery reference in sale detail response', async () => {
      // Spec: "Optional reference remains transient"
      // The sale detail response MUST NOT include any persisted delivery-reference field.
      // The delivery message reference lives only in client-side component state.
      enrichedRepo.setEnriched('sale-1', {
        customerName: 'Juan Pérez',
        customerPhone: '+5491123456789',
        customerAddress: 'Av. Corrientes 1234',
        customerDistrict: 'CABA',
        googleMapsUrl: 'https://maps.google.com/?q=Av.+Corrientes+1234',
        lines: [
          { lineId: 'line-1', displayLabel: 'Camiseta Blanca', productName: 'Camiseta', sku: 'CAM-BLA-M', attributes: {} },
          { lineId: 'line-2', displayLabel: 'Pantalón', productName: 'Pantalón', sku: 'PAN-NEG-L', attributes: {} },
        ],
      });

      const result = await useCase.execute({ saleId: 'sale-1' });

      expect(result.ok).toBe(true);
      const detail = result.value as Record<string, unknown>;

      // Assert: no persisted reference or deliveryReference field exists
      expect(detail).not.toHaveProperty('reference');
      expect(detail).not.toHaveProperty('deliveryReference');
      expect(detail).not.toHaveProperty('messageReference');
    });
  });

  describe('not found', () => {
    it('returns err with NotFoundError for non-existent sale', async () => {
      const result = await useCase.execute({ saleId: 'non-existent' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(result.error.message).toContain('non-existent');
    });
  });
});
