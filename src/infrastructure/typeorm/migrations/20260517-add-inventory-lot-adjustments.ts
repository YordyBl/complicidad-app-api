/**
 * Migration: Add inventory lot adjustments ledger.
 *
 * Creates the immutable append-only `inventory_lot_adjustments` table
 * for recording every inventory correction with full before/after audit
 * snapshots.
 *
 * Steps:
 * 1. Create `inventory_lot_adjustments` table with all audit columns
 * 2. Create indexes for lot-level and variant-level queries
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryLotAdjustments20260517 implements MigrationInterface {
  name = 'AddInventoryLotAdjustments20260517';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Create inventory_lot_adjustments table ────────────────
    await queryRunner.query(`
      CREATE TABLE "inventory_lot_adjustments" (
        "id"                    uuid DEFAULT gen_random_uuid() NOT NULL,
        "variant_id"            uuid NOT NULL,
        "lot_id"                uuid,
        "action"                varchar(30) NOT NULL,
        "before_quantity"       integer NOT NULL,
        "after_quantity"        integer NOT NULL,
        "before_unit_cost_cents" integer NOT NULL,
        "after_unit_cost_cents"  integer NOT NULL,
        "delta_quantity"        integer NOT NULL,
        "reason"                text NOT NULL,
        "actor_id"              varchar(255) NOT NULL,
        "actor_source"          varchar(100) NOT NULL,
        "requested_at"          timestamptz NOT NULL,
        "effective_at"          timestamptz NOT NULL,
        "correlation_id"        varchar(255),
        "created_at"            timestamptz NOT NULL DEFAULT now(),
        "updated_at"            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_lot_adjustments" PRIMARY KEY ("id")
      )
    `);

    // ── 2. Create indexes ───────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX "idx_lot_adjustments_lot_id"
      ON "inventory_lot_adjustments" ("lot_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_lot_adjustments_variant_id"
      ON "inventory_lot_adjustments" ("variant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_lot_adjustments_action"
      ON "inventory_lot_adjustments" ("action")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_lot_adjustments_effective_at"
      ON "inventory_lot_adjustments" ("effective_at" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lot_adjustments_lot_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lot_adjustments_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lot_adjustments_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lot_adjustments_effective_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_lot_adjustments"`);
  }
}
