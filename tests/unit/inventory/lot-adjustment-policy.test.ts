/**
 * Unit tests for LotAdjustmentPolicy — intact-vs-historical rules.
 *
 * Tests the pure domain logic that determines whether a lot can be
 * edited in-place (intact) or requires a compensating adjustment.
 */
import { describe, it, expect } from 'vitest';
import { isLotIntact } from '../../../src/modules/inventory/domain/services/LotAdjustmentPolicy.js';
import { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import { PurchaseId } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { Money } from '../../../src/shared/domain/Money.js';

// ── Helpers ──────────────────────────────────────────────────

function createLot(overrides?: { purchased?: number; remaining?: number }): PurchaseLot {
  return new PurchaseLot(
    PurchaseLotId.generate(),
    VariantId.generate(),
    PurchaseId.generate(),
    overrides?.purchased ?? 100,
    overrides?.remaining ?? 100,
    Money.fromCents(1500),
    new Date('2025-01-01'),
    null,
  );
}

// ── isLotIntact ──────────────────────────────────────────────

describe('isLotIntact', () => {
  describe('intact lot (can be edited in place)', () => {
    it('returns true when lot is fully available with no consumption or adjustments', () => {
      const lot = createLot({ purchased: 100, remaining: 100 });

      const result = isLotIntact(lot, false, false);

      expect(result).toBe(true);
    });
  });

  describe('partially consumed lot is NOT intact', () => {
    it('returns false when remaining < purchased', () => {
      const lot = createLot({ purchased: 100, remaining: 50 });

      const result = isLotIntact(lot, false, false);

      expect(result).toBe(false);
    });
  });

  describe('lot with consumption records is NOT intact', () => {
    it('returns false even if remaining == purchased but consumption records exist', () => {
      // Lot was fully consumed and then restored (return), so remaining == purchased
      // but consumption history exists
      const lot = createLot({ purchased: 100, remaining: 100 });

      const result = isLotIntact(lot, true, false);

      expect(result).toBe(false);
    });
  });

  describe('lot with prior adjustments is NOT intact', () => {
    it('returns false when prior adjustment records reference this lot', () => {
      const lot = createLot({ purchased: 100, remaining: 100 });

      const result = isLotIntact(lot, false, true);

      expect(result).toBe(false);
    });
  });

  describe('fully consumed and restored with both consumption and adjustments', () => {
    it('returns false when both flags are true', () => {
      const lot = createLot({ purchased: 100, remaining: 100 });

      const result = isLotIntact(lot, true, true);

      expect(result).toBe(false);
    });
  });

  describe('exhausted lot is NOT intact', () => {
    it('returns false when remaining is 0', () => {
      const lot = createLot({ purchased: 100, remaining: 0 });

      const result = isLotIntact(lot, false, false);

      expect(result).toBe(false);
    });
  });

  describe('lot with remaining < purchased and no records is NOT intact', () => {
    it('returns false when remaining differs from purchased regardless of records', () => {
      const lot = createLot({ purchased: 100, remaining: 80 });

      const result = isLotIntact(lot, false, false);

      expect(result).toBe(false);
    });
  });
});
