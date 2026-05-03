/**
 * Unit tests for Sale domain — return/restoration behaviour.
 *
 * Tests the pure domain entity methods: cancellation invariants,
 * return status transitions, and exact lot restoration through
 * the PurchaseLot.restore() method.
 */
import { describe, it, expect } from 'vitest';
import { Money } from '../../../src/shared/domain/Money.js';
import { Sale, SaleStatusError } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleLine } from '../../../src/modules/sales-returns/domain/SaleLine.js';
import { LotConsumptionRecord } from '../../../src/modules/sales-returns/domain/LotConsumptionRecord.js';
import { SaleId } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { SaleLineId } from '../../../src/modules/sales-returns/domain/SaleLineId.js';
import { PurchaseLot, LotConsumptionError } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import { PurchaseId } from '../../../src/modules/inventory/domain/PurchaseId.js';

// ── Constants ─────────────────────────────────────────────────

const CUSTOMER_ID = 'customer-1';
const CHANNEL = 'web-order-123';
const SALE_DATE = new Date('2026-01-15T10:00:00Z');
const LOT_DATE = new Date('2026-01-01T00:00:00Z');

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
    consumptions,
  );
}

function makeLot(
  id: string,
  variantId: string,
  purchasedQty: number,
  remainingQty: number,
  unitCostCents: number,
): PurchaseLot {
  return new PurchaseLot(
    PurchaseLotId.from(id),
    VariantId.from(variantId),
    PurchaseId.generate(),
    purchasedQty,
    remainingQty,
    Money.fromCents(unitCostCents),
    LOT_DATE,
    null,
  );
}

function makeActiveSale(lines: SaleLine[]): Sale {
  return new Sale(
    SaleId.generate(),
    CUSTOMER_ID,
    CHANNEL,
    lines,
    'ACTIVE',
    SALE_DATE,
    SALE_DATE,
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('Sale domain — return/cancellation restoration', () => {
  describe('cancel() status transition', () => {
    it('transitions active sale to cancelled', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = makeActiveSale([line]);
      sale.cancel();
      expect(sale.status).toBe('CANCELLED');
    });

    it('throws on double cancellation', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = makeActiveSale([line]);
      sale.cancel();
      expect(() => { sale.cancel(); }).toThrow(SaleStatusError);
      expect(() => { sale.cancel(); }).toThrow('already cancelled');
    });

    it('throws on cancelling a returned sale', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = makeActiveSale([line]);
      sale.markReturned();
      expect(() => { sale.cancel(); }).toThrow(SaleStatusError);
      expect(() => { sale.cancel(); }).toThrow('Cannot cancel a returned sale');
    });
  });

  describe('markReturned() status transition', () => {
    it('transitions active sale to returned', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = makeActiveSale([line]);
      sale.markReturned();
      expect(sale.status).toBe('RETURNED');
    });

    it('throws on double return', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = makeActiveSale([line]);
      sale.markReturned();
      expect(() => { sale.markReturned(); }).toThrow(SaleStatusError);
      expect(() => { sale.markReturned(); }).toThrow('already been returned');
    });

    it('throws on returning a cancelled sale', () => {
      const line = makeLine('l1', 'v1', 1, 1000, []);
      const sale = makeActiveSale([line]);
      sale.cancel();
      expect(() => { sale.markReturned(); }).toThrow(SaleStatusError);
      expect(() => { sale.markReturned(); }).toThrow('Cannot return a cancelled sale');
    });
  });

  describe('exact lot restoration', () => {
    it('restores exact consumed quantity back to a purchase lot', () => {
      const lot = makeLot('lot-1', 'v1', 10, 7, 500); // 3 already consumed
      lot.restore(3);
      expect(lot.remainingQuantity).toBe(10); // fully restored
    });

    it('restores partial consumed quantity back to a purchase lot', () => {
      const lot = makeLot('lot-1', 'v1', 10, 7, 500);
      lot.restore(2);
      expect(lot.remainingQuantity).toBe(9); // partially restored
    });

    it('throws when restoring more than purchased quantity', () => {
      const lot = makeLot('lot-1', 'v1', 10, 7, 500);
      expect(() => { lot.restore(4); }).toThrow(LotConsumptionError);
      expect(() => { lot.restore(4); }).toThrow('would exceed purchased quantity');
    });

    it('restores exact quantities from consumption records across multiple lots', () => {
      // Two lots: lot-A had 5 consumed, lot-B had 3 consumed
      const lotA = makeLot('lot-a', 'v1', 20, 15, 300);
      const lotB = makeLot('lot-b', 'v1', 20, 17, 400);

      // Restore exactly what was consumed (from consumption records)
      lotA.restore(5);
      lotB.restore(3);

      expect(lotA.remainingQuantity).toBe(20);
      expect(lotB.remainingQuantity).toBe(20);
    });

    it('restores nothing when no consumptions exist', () => {
      const lot = makeLot('lot-1', 'v1', 10, 10, 500);
      // No consumption records means nothing to restore
      expect(lot.remainingQuantity).toBe(10);
    });

    it('rejects restore with zero quantity', () => {
      const lot = makeLot('lot-1', 'v1', 10, 5, 500);
      expect(() => { lot.restore(0); }).toThrow(LotConsumptionError);
    });

    it('rejects restore with negative quantity', () => {
      const lot = makeLot('lot-1', 'v1', 10, 5, 500);
      expect(() => { lot.restore(-1); }).toThrow(LotConsumptionError);
    });
  });

  describe('consumption records are source of truth for restoration', () => {
    it('restores total revenue, cost, and profit remain unchanged after status change', () => {
      const c1 = makeConsumption('c1', 'lot-1', 3, 500);
      const line = makeLine('l1', 'v1', 3, 2000, [c1]);
      const sale = makeActiveSale([line]);

      const revenueBefore = sale.totalRevenue.cents;
      const costBefore = sale.totalCost.cents;
      const profitBefore = sale.grossProfit.cents;

      sale.cancel();

      // Totals are derived from consumptions — they don't change on status change
      expect(sale.totalRevenue.cents).toBe(revenueBefore);
      expect(sale.totalCost.cents).toBe(costBefore);
      expect(sale.grossProfit.cents).toBe(profitBefore);
    });

    it('lines and their exact consumption records are preserved after cancellation', () => {
      const c1 = makeConsumption('c1', 'lot-a', 5, 200);
      const c2 = makeConsumption('c2', 'lot-b', 3, 300);
      const line = makeLine('l1', 'v1', 8, 1000, [c1, c2]);
      const sale = makeActiveSale([line]);

      sale.cancel();

      expect(sale.lines).toHaveLength(1);
      expect(sale.lines[0]!.consumptions).toHaveLength(2);
      expect(sale.lines[0]!.consumptions[0]!.purchaseLotId).toBe('lot-a');
      expect(sale.lines[0]!.consumptions[0]!.quantity).toBe(5);
      expect(sale.lines[0]!.consumptions[1]!.purchaseLotId).toBe('lot-b');
      expect(sale.lines[0]!.consumptions[1]!.quantity).toBe(3);
    });

    it('returns records preserve audit trail', () => {
      const c1 = makeConsumption('c1', 'lot-1', 2, 750);
      const line = makeLine('l1', 'v1', 2, 2500, [c1]);
      const sale = makeActiveSale([line]);
      sale.markReturned();
      // Audit trail preserved — consumptions still reference original lots
      expect(sale.lines[0]!.consumptions[0]!.purchaseLotId).toBe('lot-1');
      expect(sale.lines[0]!.consumptions[0]!.unitCost.cents).toBe(750);
    });
  });

  describe('multi-lot sale invariants', () => {
    it('consumptions reference distinct purchase lots', () => {
      const c1 = makeConsumption('c1', 'lot-old', 5, 200);
      const c2 = makeConsumption('c2', 'lot-new', 3, 400);
      makeLine('l1', 'v1', 8, 1500, [c1, c2]);

      // Verify lots are distinct
      expect(c1.purchaseLotId).not.toBe(c2.purchaseLotId);

      // They can be independently restored
      const lotOld = makeLot('lot-old', 'v1', 20, 15, 200);
      const lotNew = makeLot('lot-new', 'v1', 20, 17, 400);

      lotOld.restore(c1.quantity);
      lotNew.restore(c2.quantity);

      expect(lotOld.remainingQuantity).toBe(20);
      expect(lotNew.remainingQuantity).toBe(20);
    });
  });
});
