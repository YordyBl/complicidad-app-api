/**
 * Unit tests for Sale domain model — FIFO consumption, frozen costs, profit calculations.
 *
 * Tests the pure domain entity calculations: total revenue, total cost,
 * gross profit from lines and their lot consumption records.
 */
import { describe, it, expect } from 'vitest';
import { Money } from '../../../src/shared/domain/Money.js';
import { Sale } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleLine } from '../../../src/modules/sales-returns/domain/SaleLine.js';
import { LotConsumptionRecord } from '../../../src/modules/sales-returns/domain/LotConsumptionRecord.js';
import { SaleId } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { SaleLineId } from '../../../src/modules/sales-returns/domain/SaleLineId.js';

// ── Constants ─────────────────────────────────────────────────

const CUSTOMER_ID = 'customer-1';
const CHANNEL = 'web-order-123';
const SALE_DATE = new Date('2026-01-15T10:00:00Z');

// ── Helpers ──────────────────────────────────────────────────

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

function makeLine(
  id: string,
  variantId: string,
  qty: number,
  unitPriceCents: number,
  consumptions: LotConsumptionRecord[],
): SaleLine {
  return new SaleLine(
    SaleLineId.from(id),
    variantId,
    qty,
    Money.fromCents(unitPriceCents),
    'regular',
    consumptions,
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('Sale domain — FIFO consumption calculations', () => {
  describe('single item, single lot', () => {
    it('calculates total revenue, cost, and gross profit for a single item', () => {
      const consumption = makeConsumption('c1', 'lot-1', 2, 500); // 2 * 500 = 1000 cost
      const line = makeLine('line-1', 'variant-1', 2, 1500, [consumption]); // 2 * 1500 = 3000 revenue

      const sale = new Sale(
        SaleId.generate(),
        CUSTOMER_ID,
        CHANNEL,
        [line],
        'ACTIVE',
        SALE_DATE,
        SALE_DATE,
      );

      expect(sale.totalRevenue.cents).toBe(3000);
      expect(sale.totalCost.cents).toBe(1000);
      expect(sale.grossProfit.cents).toBe(2000); // 3000 - 1000
    });
  });

  describe('single item, multiple lots (FIFO)', () => {
    it('calculates total cost across multiple lots with different unit costs', () => {
      const c1 = makeConsumption('c1', 'lot-old', 5, 200); // 5 * 200 = 1000
      const c2 = makeConsumption('c2', 'lot-mid', 3, 300); // 3 * 300 = 900
      // total cost = 1900

      const line = makeLine('line-1', 'variant-1', 8, 1000, [c1, c2]); // 8 * 1000 = 8000 revenue

      const sale = new Sale(
        SaleId.generate(),
        CUSTOMER_ID,
        CHANNEL,
        [line],
        'ACTIVE',
        SALE_DATE,
        SALE_DATE,
      );

      expect(sale.totalRevenue.cents).toBe(8000);
      expect(sale.totalCost.cents).toBe(1900);
      expect(sale.grossProfit.cents).toBe(6100);
    });
  });

  describe('multiple items', () => {
    it('calculates totals across multiple sale lines', () => {
      // Line 1: 3 units @ 2000 = 6000, cost from 2 lots: 3*300=900 + 0 = 900
      const c1 = makeConsumption('c1', 'lot-1', 3, 300);
      const line1 = makeLine('line-1', 'variant-1', 3, 2000, [c1]);

      // Line 2: 2 units @ 5000 = 10000, cost: 2*1200=2400
      const c2 = makeConsumption('c2', 'lot-2', 2, 1200);
      const line2 = makeLine('line-2', 'variant-2', 2, 5000, [c2]);

      const sale = new Sale(
        SaleId.generate(),
        CUSTOMER_ID,
        CHANNEL,
        [line1, line2],
        'ACTIVE',
        SALE_DATE,
        SALE_DATE,
      );

      // Revenue: 6000 + 10000 = 16000
      expect(sale.totalRevenue.cents).toBe(16000);
      // Cost: 900 + 2400 = 3300
      expect(sale.totalCost.cents).toBe(3300);
      // Profit: 16000 - 3300 = 12700
      expect(sale.grossProfit.cents).toBe(12700);
    });

    it('handles a line with no consumptions (zero-cost item)', () => {
      const c1 = makeConsumption('c1', 'lot-1', 5, 400);
      const line1 = makeLine('line-1', 'v1', 5, 1000, [c1]);
      const line2 = makeLine('line-2', 'v2', 1, 500, []); // zero cost

      const sale = new Sale(
        SaleId.generate(),
        CUSTOMER_ID,
        CHANNEL,
        [line1, line2],
        'ACTIVE',
        SALE_DATE,
        SALE_DATE,
      );

      expect(sale.totalRevenue.cents).toBe(5500); // 5*1000 + 1*500
      expect(sale.totalCost.cents).toBe(2000); // 5*400 + 0
      expect(sale.grossProfit.cents).toBe(3500);
    });
  });

  describe('frozen costs', () => {
    it('preserves exact lot unit costs even if lot prices change later', () => {
      // The consumption records freeze the costs at sale time
      const consumption = makeConsumption('c1', 'lot-1', 10, 750);
      const line = makeLine('line-1', 'v1', 10, 2000, [consumption]);

      const sale = new Sale(
        SaleId.generate(),
        CUSTOMER_ID,
        CHANNEL,
        [line],
        'ACTIVE',
        SALE_DATE,
        SALE_DATE,
      );

      // Verify frozen cost
      expect(sale.lines[0]!.consumptions[0]!.unitCost.cents).toBe(750);
      expect(sale.lines[0]!.consumptions[0]!.subtotal.cents).toBe(7500);
      expect(sale.totalCost.cents).toBe(7500);
    });
  });

  describe('sale invariants', () => {
    it('rejects sale with empty channel reference', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      expect(
        () => new Sale(SaleId.generate(), CUSTOMER_ID, '', [line], 'ACTIVE', SALE_DATE, SALE_DATE),
      ).toThrow('Channel reference is required');
    });

    it('rejects sale with whitespace-only channel reference', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      expect(
        () => new Sale(SaleId.generate(), CUSTOMER_ID, '   ', [line], 'ACTIVE', SALE_DATE, SALE_DATE),
      ).toThrow('Channel reference is required');
    });

    it('rejects sale with no lines', () => {
      expect(
        () => new Sale(SaleId.generate(), CUSTOMER_ID, CHANNEL, [], 'ACTIVE', SALE_DATE, SALE_DATE),
      ).toThrow('Sale must have at least one line');
    });

    it('rejects invalid sale status', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      expect(
        () => new Sale(SaleId.generate(), CUSTOMER_ID, CHANNEL, [line], 'INVALID' as 'ACTIVE', SALE_DATE, SALE_DATE),
      ).toThrow('Invalid sale status');
    });
  });

  describe('sale status transitions', () => {
    it('starts as ACTIVE', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = new Sale(SaleId.generate(), CUSTOMER_ID, CHANNEL, [line], 'ACTIVE', SALE_DATE, SALE_DATE);
      expect(sale.status).toBe('ACTIVE');
    });

    it('can be cancelled', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = new Sale(SaleId.generate(), CUSTOMER_ID, CHANNEL, [line], 'ACTIVE', SALE_DATE, SALE_DATE);
      sale.cancel();
      expect(sale.status).toBe('CANCELLED');
    });

    it('rejects double cancellation', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = new Sale(SaleId.generate(), CUSTOMER_ID, CHANNEL, [line], 'ACTIVE', SALE_DATE, SALE_DATE);
      sale.cancel();
      expect(() => { sale.cancel(); }).toThrow('Sale is already cancelled');
    });
  });

  describe('sale line invariants', () => {
    it('rejects line with zero quantity', () => {
      expect(
        () => new SaleLine(SaleLineId.from('l1'), 'v1', 0, Money.fromCents(1000), 'regular', []),
      ).toThrow('Quantity must be positive');
    });

    it('rejects line with negative quantity', () => {
      expect(
        () => new SaleLine(SaleLineId.from('l1'), 'v1', -1, Money.fromCents(1000), 'regular', []),
      ).toThrow('Quantity must be positive');
    });

    it('rejects line with negative unit price', () => {
      expect(
        () => new SaleLine(SaleLineId.from('l1'), 'v1', 1, Money.fromCents(-500), 'regular', []),
      ).toThrow('Unit price cannot be negative');
    });
  });

  describe('line-level calculations', () => {
    it('calculates total price for a line', () => {
      const line = makeLine('l1', 'v1', 5, 2000, []);
      expect(line.totalPrice.cents).toBe(10000);
    });

    it('calculates total cost from multiple consumption records', () => {
      const c1 = makeConsumption('c1', 'lot-1', 2, 300);
      const c2 = makeConsumption('c2', 'lot-2', 3, 400);
      const line = makeLine('l1', 'v1', 5, 2000, [c1, c2]);

      expect(line.totalCost.cents).toBe(1800); // 2*300 + 3*400
    });

    it('has zero cost when no consumptions', () => {
      const line = makeLine('l1', 'v1', 5, 2000, []);
      expect(line.totalCost.cents).toBe(0);
    });
  });
});
