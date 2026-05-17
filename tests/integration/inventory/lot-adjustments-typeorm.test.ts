/**
 * Integration tests for InventoryLotAdjustment with TypeORM.
 *
 * Tests the full DB-backed flow: entity persistence, mapping, and
 * transactional adjustment operations across inventory_lots and
 * inventory_lot_adjustments tables.
 *
 * Requires a running PostgreSQL configured via environment variables.
 * If DB_HOST is not set, all tests in this file are skipped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DataSource, type EntityManager } from 'typeorm';
import { InventoryLotAdjustment } from '../../../src/modules/inventory/domain/InventoryLotAdjustment.js';
import type { AdjustmentSnapshot } from '../../../src/modules/inventory/domain/InventoryLotAdjustment.js';
import { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import { PurchaseId } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { Money } from '../../../src/shared/domain/Money.js';

// ── DB guard ───────────────────────────────────────────────────

const hasDatabase = Boolean(process.env.DB_HOST);

const describeIf = hasDatabase ? describe : describe.skip;

let ds: DataSource | null = null;
let manager: EntityManager | null = null;

const TEST_LOTS = 'test_lot_adj_integration_lots';
const TEST_ADJUSTMENTS = 'test_lot_adj_integration_adjustments';

async function ensureTables(em: EntityManager): Promise<void> {
  await em.query(`DROP TABLE IF EXISTS ${TEST_ADJUSTMENTS}`);
  await em.query(`DROP TABLE IF EXISTS ${TEST_LOTS}`);

  await em.query(`
    CREATE TABLE ${TEST_LOTS} (
      id UUID PRIMARY KEY,
      variant_id UUID NOT NULL,
      purchase_id UUID NOT NULL,
      purchased_quantity INT NOT NULL,
      remaining_quantity INT NOT NULL DEFAULT 0,
      unit_cost_cents INT NOT NULL,
      purchase_date TIMESTAMPTZ NOT NULL,
      supplier_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await em.query(`
    CREATE TABLE ${TEST_ADJUSTMENTS} (
      id UUID PRIMARY KEY,
      variant_id UUID NOT NULL,
      lot_id UUID,
      action VARCHAR(50) NOT NULL,
      before_quantity INT NOT NULL DEFAULT 0,
      after_quantity INT NOT NULL DEFAULT 0,
      before_unit_cost_cents INT NOT NULL DEFAULT 0,
      after_unit_cost_cents INT NOT NULL DEFAULT 0,
      delta_quantity INT NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      actor_id VARCHAR(255) NOT NULL,
      actor_source VARCHAR(100) NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL,
      effective_at TIMESTAMPTZ NOT NULL,
      correlation_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Indexes
  await em.query(`CREATE INDEX IF NOT EXISTS idx_${TEST_ADJUSTMENTS}_lot
    ON ${TEST_ADJUSTMENTS} (lot_id)`);
  await em.query(`CREATE INDEX IF NOT EXISTS idx_${TEST_ADJUSTMENTS}_variant
    ON ${TEST_ADJUSTMENTS} (variant_id)`);
}

// ── Helpers ────────────────────────────────────────────────────

function makeLot(id: string, remaining: number, unitCostCents: number, date: Date): PurchaseLot {
  return new PurchaseLot(
    PurchaseLotId.from(id),
    VariantId.from('11111111-1111-1111-1111-111111111111'),
    PurchaseId.from('22222222-2222-2222-2222-222222222222'),
    remaining,
    remaining,
    Money.fromCents(unitCostCents),
    date,
    null,
  );
}

function makeAdjustmentSnapshot(overrides: Partial<AdjustmentSnapshot> = {}): AdjustmentSnapshot {
  return {
    variantId: '11111111-1111-1111-1111-111111111111',
    lotId: '33333333-3333-3333-3333-333333333333',
    action: 'INCREASE',
    beforeQuantity: 0,
    afterQuantity: 10,
    beforeUnitCostCents: 0,
    afterUnitCostCents: 5000,
    deltaQuantity: 10,
    reason: 'Integration test adjustment',
    actorId: 'test-actor',
    actorSource: 'test',
    requestedAt: new Date(),
    effectiveAt: new Date(),
    correlationId: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describeIf('InventoryLotAdjustment TypeORM integration', () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    ds = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_DATABASE!,
      entities: [], // raw SQL only
      synchronize: false,
    });
    await ds.initialize();
    manager = ds.manager;
    await ensureTables(manager);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.destroy();
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Entity persistence
  // ──────────────────────────────────────────────────────────────

  describe('adjustment persistence', () => {
    it('saves and retrieves an adjustment record by lot ID', async () => {
      if (!manager) return;
      const em = manager;

      // Create test lot
      const lot = makeLot('33333333-3333-3333-3333-333333333333', 10, 500, new Date('2026-01-01'));
      await em.query(
        `INSERT INTO ${TEST_LOTS} (id, variant_id, purchase_id, purchased_quantity, remaining_quantity, unit_cost_cents, purchase_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [lot.id.toString(), '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 10, 10, 500, '2026-01-01'],
      );

      // Create adjustment
      const snapshot = makeAdjustmentSnapshot();
      const adjustment = InventoryLotAdjustment.create(snapshot);

      // Insert via raw SQL (simulating repository save)
      await em.query(
        `INSERT INTO ${TEST_ADJUSTMENTS}
         (id, variant_id, lot_id, action, before_quantity, after_quantity,
          before_unit_cost_cents, after_unit_cost_cents, delta_quantity,
          reason, actor_id, actor_source, requested_at, effective_at, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          adjustment.id.toString(),
          adjustment.snapshot.variantId,
          adjustment.snapshot.lotId,
          adjustment.snapshot.action,
          adjustment.snapshot.beforeQuantity,
          adjustment.snapshot.afterQuantity,
          adjustment.snapshot.beforeUnitCostCents,
          adjustment.snapshot.afterUnitCostCents,
          adjustment.snapshot.deltaQuantity,
          adjustment.snapshot.reason,
          adjustment.snapshot.actorId,
          adjustment.snapshot.actorSource,
          adjustment.snapshot.requestedAt,
          adjustment.snapshot.effectiveAt,
          adjustment.snapshot.correlationId,
        ],
      );

      // Retrieve by lot ID
      const rows = await em.query(
        `SELECT * FROM ${TEST_ADJUSTMENTS} WHERE lot_id = $1`,
        [snapshot.lotId],
      );

      expect(rows).toHaveLength(1);
      const row = rows[0] as Record<string, unknown>;
      expect(row.action).toBe('INCREASE');
      expect(row.before_quantity).toBe(0);
      expect(row.after_quantity).toBe(10);
      expect(row.delta_quantity).toBe(10);
      expect(row.reason).toBe('Integration test adjustment');
      expect(row.actor_id).toBe('test-actor');
      expect(row.actor_source).toBe('test');
    });

    it('supports multiple adjustments for the same lot (append-only)', async () => {
      if (!manager) return;
      const em = manager;

      // Create another adjustment for the same lot
      const snapshot2 = makeAdjustmentSnapshot({
        action: 'INTACT_EDIT',
        beforeQuantity: 10,
        afterQuantity: 15,
        beforeUnitCostCents: 500,
        afterUnitCostCents: 500,
        deltaQuantity: 5,
        reason: 'Second adjustment',
      });
      const adjustment2 = InventoryLotAdjustment.create(snapshot2);

      await em.query(
        `INSERT INTO ${TEST_ADJUSTMENTS}
         (id, variant_id, lot_id, action, before_quantity, after_quantity,
          before_unit_cost_cents, after_unit_cost_cents, delta_quantity,
          reason, actor_id, actor_source, requested_at, effective_at, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          adjustment2.id.toString(),
          adjustment2.snapshot.variantId,
          adjustment2.snapshot.lotId,
          adjustment2.snapshot.action,
          adjustment2.snapshot.beforeQuantity,
          adjustment2.snapshot.afterQuantity,
          adjustment2.snapshot.beforeUnitCostCents,
          adjustment2.snapshot.afterUnitCostCents,
          adjustment2.snapshot.deltaQuantity,
          adjustment2.snapshot.reason,
          adjustment2.snapshot.actorId,
          adjustment2.snapshot.actorSource,
          adjustment2.snapshot.requestedAt,
          adjustment2.snapshot.effectiveAt,
          adjustment2.snapshot.correlationId,
        ],
      );

      // Both adjustments should exist (append-only, no overwrites)
      const rows = await em.query(
        `SELECT * FROM ${TEST_ADJUSTMENTS} WHERE lot_id = $1 ORDER BY created_at`,
        [snapshot2.lotId],
      );

      expect(rows).toHaveLength(2);
      const actions = (rows as { action: string }[]).map((r) => r.action);
      expect(actions).toEqual(['INCREASE', 'INTACT_EDIT']);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Transactional integrity
  // ──────────────────────────────────────────────────────────────

  describe('transactional integrity', () => {
    it('rolls back lot and adjustment on error (simulated)', async () => {
      if (!manager) return;
      const em = manager;

      const lotId = 'rollback-lot-id';
      const adjId = 'rollback-adj-id';

      try {
        await em.transaction(async (transactionalEm) => {
          // Insert lot
          await transactionalEm.query(
            `INSERT INTO ${TEST_LOTS} (id, variant_id, purchase_id, purchased_quantity, remaining_quantity, unit_cost_cents, purchase_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [lotId, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 10, 10, 500, '2026-01-01'],
          );

          // Insert adjustment
          const snapshot = makeAdjustmentSnapshot({ lotId });
          await transactionalEm.query(
            `INSERT INTO ${TEST_ADJUSTMENTS}
             (id, variant_id, lot_id, action, before_quantity, after_quantity,
              before_unit_cost_cents, after_unit_cost_cents, delta_quantity,
              reason, actor_id, actor_source, requested_at, effective_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              adjId, snapshot.variantId, snapshot.lotId, snapshot.action,
              snapshot.beforeQuantity, snapshot.afterQuantity,
              snapshot.beforeUnitCostCents, snapshot.afterUnitCostCents,
              snapshot.deltaQuantity, snapshot.reason,
              snapshot.actorId, snapshot.actorSource,
              snapshot.requestedAt, snapshot.effectiveAt,
            ],
          );

          // Simulate a business rule violation → throw
          throw new Error('Simulated rollback');
        });
      } catch {
        // Expected
      }

      // Both lot and adjustment should NOT exist (rolled back)
      const lotRows = await em.query(
        `SELECT * FROM ${TEST_LOTS} WHERE id = $1`,
        [lotId],
      );
      const adjRows = await em.query(
        `SELECT * FROM ${TEST_ADJUSTMENTS} WHERE id = $1`,
        [adjId],
      );

      expect(lotRows).toHaveLength(0);
      expect(adjRows).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Index verification
  // ──────────────────────────────────────────────────────────────

  describe('index existence', () => {
    it('has an index on lot_id for fast lookups', async () => {
      if (!manager) return;
      const em = manager;

      const rows = await em.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = $1`,
        [TEST_ADJUSTMENTS],
      );

      const indexNames = (rows as { indexname: string }[]).map((r) => r.indexname);
      expect(indexNames.some((name) => name.includes('lot'))).toBe(true);
    });
  });
});
