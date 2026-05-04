/**
 * Application tests for GetSaleDetailUseCase.
 *
 * Verifies:
 * - Found sale → returns ok(SaleDetailResponse) with lines and consumptions
 * - Not found sale → returns err(NotFoundError)
 * - DTO shape includes nested line totals and consumption details
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { Sale } from '../../../src/modules/sales-returns/domain/Sale.js';
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

  async findAll(): Promise<SaleEntity[]> {
    return Array.from(this.sales.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
    [line1, line2],
    'ACTIVE',
    new Date('2026-03-15T10:00:00.000Z'),
    new Date('2026-03-16T14:30:00.000Z'),
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('GetSaleDetailUseCase', () => {
  let repo: FakeSaleRepository;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let useCase: any;

  beforeEach(async () => {
    repo = new FakeSaleRepository();
    repo.sales.set('sale-1', makeSaleWithLines('sale-1'));

    const mod = await import('../../../src/modules/sales-returns/application/use-cases/GetSaleDetailUseCase.js');
    useCase = new mod.GetSaleDetailUseCase(repo);
  });

  describe('found sale', () => {
    it('returns ok with full detail DTO', async () => {
      const result = await useCase.execute({ saleId: 'sale-1' });

      expect(result.ok).toBe(true);
      const detail = result.value;

      // Top-level fields
      expect(detail.id).toBe('sale-1');
      expect(detail.customerId).toBe('customer-1');
      expect(detail.channelReference).toBe('web-order-123');
      expect(detail.status).toBe('ACTIVE');
      expect(detail.createdAt).toBe('2026-03-15T10:00:00.000Z');
      expect(detail.updatedAt).toBe('2026-03-16T14:30:00.000Z');

      // Computed totals
      // Revenue: 3*2000 + 2*1500 = 9000
      expect(detail.totalRevenueCents).toBe(9000);
      // Cost: 1500 + 1600 = 3100
      expect(detail.totalCostCents).toBe(3100);
      expect(detail.grossProfitCents).toBe(5900);
    });

    it('includes lines with computed totals', async () => {
      const result = await useCase.execute({ saleId: 'sale-1' });
      const detail = result.value;

      expect(detail.lines).toHaveLength(2);

      // Line 1: 3 units * 2000 = 6000 revenue, cost = 1500
      const line1 = detail.lines.find((l: { id: string }) => l.id === 'line-1');
      expect(line1).toBeDefined();
      expect(line1.variantId).toBe('variant-a');
      expect(line1.quantity).toBe(3);
      expect(line1.unitPriceCents).toBe(2000);
      expect(line1.priceType).toBe('regular');
      expect(line1.totalPriceCents).toBe(6000);
      expect(line1.totalCostCents).toBe(1500);

      // Line 2: 2 units * 1500 = 3000 revenue, cost = 1600
      const line2 = detail.lines.find((l: { id: string }) => l.id === 'line-2');
      expect(line2).toBeDefined();
      expect(line2.variantId).toBe('variant-b');
      expect(line2.quantity).toBe(2);
      expect(line2.priceType).toBe('presale');
      expect(line2.totalPriceCents).toBe(3000);
      expect(line2.totalCostCents).toBe(1600);
    });

    it('includes consumption records inside lines', async () => {
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
