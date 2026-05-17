/**
 * Unit tests for InventoryLotAdjustment domain invariants.
 *
 * The adjustment is an immutable audit record — once persisted, it MUST not change.
 */
import { describe, it, expect } from 'vitest';
import {
  InventoryLotAdjustment,
  InventoryLotAdjustmentError,
  type AdjustmentAction,
  type AdjustmentSnapshot,
} from '../../../src/modules/inventory/domain/InventoryLotAdjustment.js';
import { InventoryLotAdjustmentId } from '../../../src/modules/inventory/domain/InventoryLotAdjustmentId.js';

// ── Helpers ──────────────────────────────────────────────────

function validSnapshot(overrides?: Partial<AdjustmentSnapshot>): AdjustmentSnapshot {
  return {
    variantId: '550e8400-e29b-41d4-a716-446655440000',
    lotId: '660e8400-e29b-41d4-a716-446655440001',
    action: 'INCREASE',
    beforeQuantity: 0,
    afterQuantity: 50,
    beforeUnitCostCents: 0,
    afterUnitCostCents: 1500,
    deltaQuantity: 50,
    reason: 'Ajuste de inventario por conteo físico',
    actorId: 'user-001',
    actorSource: 'trusted-header',
    requestedAt: new Date('2025-06-01T10:00:00Z'),
    effectiveAt: new Date('2025-06-01T10:00:00Z'),
    correlationId: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('InventoryLotAdjustment', () => {
  describe('creation with valid data', () => {
    it('creates an adjustment record for an INCREASE action', () => {
      const snapshot = validSnapshot();
      const adjustment = InventoryLotAdjustment.create(snapshot);

      expect(adjustment.id).toBeInstanceOf(InventoryLotAdjustmentId);
      expect(adjustment.snapshot.action).toBe('INCREASE');
      expect(adjustment.snapshot.variantId).toBe(snapshot.variantId);
      expect(adjustment.snapshot.deltaQuantity).toBe(50);
      expect(adjustment.snapshot.reason).toBe(snapshot.reason);
      expect(adjustment.snapshot.actorId).toBe('user-001');
      expect(adjustment.snapshot.actorSource).toBe('trusted-header');
      expect(adjustment.createdAt).toBeInstanceOf(Date);
    });

    it('creates an adjustment for INTACT_EDIT with before/after values', () => {
      const snapshot = validSnapshot({
        action: 'INTACT_EDIT',
        beforeQuantity: 100,
        afterQuantity: 80,
        beforeUnitCostCents: 1500,
        afterUnitCostCents: 1500,
        deltaQuantity: -20,
      });

      const adjustment = InventoryLotAdjustment.create(snapshot);

      expect(adjustment.snapshot.action).toBe('INTACT_EDIT');
      expect(adjustment.snapshot.beforeQuantity).toBe(100);
      expect(adjustment.snapshot.afterQuantity).toBe(80);
    });

    it('creates an adjustment for HISTORICAL_COMPENSATION with cost correction', () => {
      const snapshot = validSnapshot({
        action: 'HISTORICAL_COMPENSATION',
        beforeQuantity: 100,
        afterQuantity: 100,
        beforeUnitCostCents: 1500,
        afterUnitCostCents: 1800,
        deltaQuantity: 0,
        reason: 'Corrección de costo histórico',
      });

      const adjustment = InventoryLotAdjustment.create(snapshot);

      expect(adjustment.snapshot.action).toBe('HISTORICAL_COMPENSATION');
      expect(adjustment.snapshot.deltaQuantity).toBe(0);
      expect(adjustment.snapshot.afterUnitCostCents).toBe(1800);
    });

    it('accepts a null lotId for manual increase (no target lot)', () => {
      const snapshot = validSnapshot({ lotId: null });

      const adjustment = InventoryLotAdjustment.create(snapshot);

      expect(adjustment.snapshot.lotId).toBeNull();
    });

    it('accepts a correlationId for cross-reference', () => {
      const snapshot = validSnapshot({ correlationId: 'corr-123' });

      const adjustment = InventoryLotAdjustment.create(snapshot);

      expect(adjustment.snapshot.correlationId).toBe('corr-123');
    });
  });

  describe('validation of required fields', () => {
    it('rejects empty reason', () => {
      expect(() =>
        InventoryLotAdjustment.create(validSnapshot({ reason: '' })),
      ).toThrow(InventoryLotAdjustmentError);
    });

    it('rejects whitespace-only reason', () => {
      expect(() =>
        InventoryLotAdjustment.create(validSnapshot({ reason: '   ' })),
      ).toThrow(InventoryLotAdjustmentError);
    });

    it('rejects empty actorId', () => {
      expect(() =>
        InventoryLotAdjustment.create(validSnapshot({ actorId: '' })),
      ).toThrow(InventoryLotAdjustmentError);
    });

    it('rejects empty actorSource', () => {
      expect(() =>
        InventoryLotAdjustment.create(validSnapshot({ actorSource: '' })),
      ).toThrow(InventoryLotAdjustmentError);
    });
  });

  describe('action type validation', () => {
    it('rejects unknown action types', () => {
      expect(() =>
        InventoryLotAdjustment.create(
          validSnapshot({ action: 'INVALID' as AdjustmentAction }),
        ),
      ).toThrow(InventoryLotAdjustmentError);
    });
  });

  describe('delta quantity invariant', () => {
    it('rejects when deltaQuantity does not match before-after quantities', () => {
      expect(() =>
        InventoryLotAdjustment.create(
          validSnapshot({
            beforeQuantity: 100,
            afterQuantity: 50,
            deltaQuantity: -30, // should be -50
          }),
        ),
      ).toThrow(InventoryLotAdjustmentError);
    });

    it('accepts when deltaQuantity correctly matches before-after', () => {
      const snapshot = validSnapshot({
        beforeQuantity: 100,
        afterQuantity: 30,
        deltaQuantity: -70,
      });

      const adjustment = InventoryLotAdjustment.create(snapshot);

      expect(adjustment.snapshot.deltaQuantity).toBe(-70);
    });
  });

  describe('immutability', () => {
    it('is frozen after creation', () => {
      const adjustment = InventoryLotAdjustment.create(validSnapshot());
      expect(Object.isFrozen(adjustment)).toBe(true);
    });
  });
});
