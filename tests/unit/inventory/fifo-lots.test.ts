/**
 * Unit tests for FIFO lot ordering and consumption.
 *
 * Tests the pure domain service that selects which lots to consume
 * from based on FIFO (First-In-First-Out) ordering.
 */
import { describe, it, expect } from 'vitest';
import { Money } from '../../../src/shared/domain/Money.js';
import { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import { PurchaseId } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { allocateFifo } from '../../../src/modules/inventory/domain/services/FifoAllocationService.js';
import { InsufficientStockError } from '../../../src/modules/inventory/domain/services/FifoAllocationService.js';

// ── Helpers ──────────────────────────────────────────────────

function makeLot(
  id: string,
  remainingQty: number,
  unitCostCents: number,
  purchaseDate: Date,
): PurchaseLot {
  return new PurchaseLot(
    PurchaseLotId.from(id),
    VariantId.from('variant-1'),
    PurchaseId.from('purchase-' + id),
    remainingQty, // purchased = remaining for tests
    remainingQty,
    Money.fromCents(unitCostCents),
    purchaseDate,
    null,
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('FIFO Allocation (allocateFifo)', () => {
  describe('single lot, exact consumption', () => {
    it('consumes entire lot when requested quantity matches remaining', () => {
      const lot = makeLot('L1', 10, 500, new Date('2025-01-01'));
      const result = allocateFifo([lot], 10);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.selections).toHaveLength(1);
      expect(result.value.selections[0]!.lotId).toBe('L1');
      expect(result.value.selections[0]!.quantity).toBe(10);
      expect(result.value.selections[0]!.unitCost.cents).toBe(500);
      expect(result.value.selections[0]!.subtotal.cents).toBe(5000); // 10 * 500
      expect(result.value.totalCost.cents).toBe(5000);
    });
  });

  describe('single lot, partial consumption', () => {
    it('consumes partial quantity from a single lot', () => {
      const lot = makeLot('L1', 20, 300, new Date('2025-02-01'));
      const result = allocateFifo([lot], 5);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.selections).toHaveLength(1);
      expect(result.value.selections[0]!.lotId).toBe('L1');
      expect(result.value.selections[0]!.quantity).toBe(5);
      expect(result.value.selections[0]!.subtotal.cents).toBe(1500); // 5 * 300
      expect(result.value.totalCost.cents).toBe(1500);
    });
  });

  describe('multiple lots, oldest-first consumption', () => {
    it('consumes from the oldest lot first', () => {
      const oldLot = makeLot('L1', 10, 200, new Date('2025-01-01'));
      const midLot = makeLot('L2', 10, 300, new Date('2025-02-01'));
      const newLot = makeLot('L3', 10, 400, new Date('2025-03-01'));

      const result = allocateFifo([oldLot, midLot, newLot], 15);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should consume: 10 from L1 (oldest) + 5 from L2 (next oldest)
      expect(result.value.selections).toHaveLength(2);
      expect(result.value.selections[0]!.lotId).toBe('L1');
      expect(result.value.selections[0]!.quantity).toBe(10);
      expect(result.value.selections[1]!.lotId).toBe('L2');
      expect(result.value.selections[1]!.quantity).toBe(5);

      // Cost: 10*200 + 5*300 = 2000 + 1500 = 3500
      expect(result.value.totalCost.cents).toBe(3500);
    });

    it('skips exhausted lots and picks the next open one', () => {
      const exhausted = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        10,
        0,
        Money.fromCents(200),
        new Date('2025-01-01'),
        null,
      );
      const open = makeLot('L2', 10, 300, new Date('2025-02-01'));

      const result = allocateFifo([exhausted, open], 5);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.selections).toHaveLength(1);
      expect(result.value.selections[0]!.lotId).toBe('L2');
      expect(result.value.selections[0]!.quantity).toBe(5);
      expect(result.value.totalCost.cents).toBe(1500);
    });
  });

  describe('exact cost calculation', () => {
    it('calculates weighted-average cost correctly across lots', () => {
      const lotA = makeLot('A', 5, 100, new Date('2025-01-01')); // 5 * 100 = 500
      const lotB = makeLot('B', 5, 200, new Date('2025-02-01')); // 5 * 200 = 1000

      const result = allocateFifo([lotA, lotB], 8);
      // 5 from A + 3 from B = 5*100 + 3*200 = 500 + 600 = 1100

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.totalCost.cents).toBe(1100);
      expect(result.value.selections).toHaveLength(2);
      expect(result.value.selections[0]!.subtotal.cents).toBe(500);
      expect(result.value.selections[1]!.subtotal.cents).toBe(600);
    });

    it('handles zero-requested-quantity gracefully', () => {
      const lot = makeLot('L1', 10, 500, new Date('2025-01-01'));
      const result = allocateFifo([lot], 0);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.selections).toHaveLength(0);
      expect(result.value.totalCost.cents).toBe(0);
    });
  });

  describe('insufficient stock', () => {
    it('returns InsufficientStockError when no lots cover the quantity', () => {
      const lot = makeLot('L1', 5, 100, new Date('2025-01-01'));
      const result = allocateFifo([lot], 10);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InsufficientStockError);
      expect(result.error.message).toContain('Stock insuficiente');
    });

    it('returns error when only exhausted lots exist', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        10,   // purchasedQuantity > 0
        0,    // remainingQuantity = 0 (exhausted)
        Money.fromCents(100),
        new Date('2025-01-01'),
        null,
      );
      const result = allocateFifo([lot], 1);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(InsufficientStockError);
    });
  });

  describe('ordering stability', () => {
    it('uses lot creation order as tiebreaker for same-date lots', () => {
      const sameDate = new Date('2025-01-01');
      // Lot IDs chosen so sorting by ID won't accidentally be correct.
      // The function must use insertion order (the order they're provided).
      const lotA = makeLot('B-later-id', 5, 100, sameDate);
      const lotB = makeLot('A-earlier-id', 5, 200, sameDate);

      const result = allocateFifo([lotA, lotB], 3);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should consume from lotA first (provided first)
      expect(result.value.selections[0]!.lotId).toBe('B-later-id');
    });
  });
});

describe('FIFO Lot entity behaviour', () => {
  describe('consume', () => {
    it('reduces remaining quantity by the consumed amount', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        10,
        10,
        Money.fromCents(500),
        new Date('2025-01-01'),
        null,
      );

      const result = lot.consume(3);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.lotId).toBe('L1');
      expect(result.value.quantity).toBe(3);
      expect(result.value.unitCost.cents).toBe(500);
      expect(result.value.subtotal.cents).toBe(1500);
    });

    it('exhausts the lot when remaining reaches zero', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        5,
        5,
        Money.fromCents(200),
        new Date('2025-01-01'),
        null,
      );

      lot.consume(5);

      expect(lot.remainingQuantity).toBe(0);
      expect(lot.isExhausted).toBe(true);
    });

    it('rejects consumption exceeding remaining quantity', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        5,
        5,
        Money.fromCents(200),
        new Date('2025-01-01'),
        null,
      );

      const result = lot.consume(10);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.message).toContain('No se pueden consumir');
      expect(lot.remainingQuantity).toBe(5); // unchanged
    });

    it('rejects consumption from an already exhausted lot', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        5,
        0,
        Money.fromCents(200),
        new Date('2025-01-01'),
        null,
      );

      const result = lot.consume(1);

      expect(result.ok).toBe(false);
    });

    it('rejects zero or negative consumption', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        10,
        10,
        Money.fromCents(500),
        new Date('2025-01-01'),
        null,
      );

      expect(lot.consume(0).ok).toBe(false);
      expect(lot.consume(-1).ok).toBe(false);
    });
  });

  describe('restore', () => {
    it('restores quantity to a partially consumed lot', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        10,
        5,
        Money.fromCents(500),
        new Date('2025-01-01'),
        null,
      );

      lot.restore(3);

      expect(lot.remainingQuantity).toBe(8);
      expect(lot.isExhausted).toBe(false);
    });

    it('reopens an exhausted lot when restoring', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        10,
        0,
        Money.fromCents(500),
        new Date('2025-01-01'),
        null,
      );

      lot.restore(2);

      expect(lot.remainingQuantity).toBe(2);
      expect(lot.isExhausted).toBe(false);
    });

    it('rejects restoration exceeding purchased quantity', () => {
      const lot = new PurchaseLot(
        PurchaseLotId.from('L1'),
        VariantId.from('V1'),
        PurchaseId.from('P1'),
        10,
        5,
        Money.fromCents(500),
        new Date('2025-01-01'),
        null,
      );

      expect(() => { lot.restore(10); }).toThrow();
    });
  });
});
