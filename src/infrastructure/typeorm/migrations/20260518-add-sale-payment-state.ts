/**
 * Migration: Add payment state columns to sales table.
 *
 * Steps:
 * 1. Add `amount_paid_cents`, `pending_balance_cents`, `payment_status`,
 *    and `settled_at` columns to `sales` (nullable initially to avoid
 *    NOT NULL constraint on existing rows).
 * 2. Backfill existing ACTIVE sales as fully paid:
 *    - amount_paid_cents = sum of line totals
 *    - pending_balance_cents = 0
 *    - payment_status = 'paid'
 * 3. Make columns NOT NULL after backfill.
 * 4. Add check constraint and indexes.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalePaymentState20260518 implements MigrationInterface {
  name = 'AddSalePaymentState20260518';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Add nullable columns ──────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN "amount_paid_cents" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN "pending_balance_cents" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN "payment_status" varchar(20)
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN "settled_at" timestamptz
    `);

    // ── 2. Backfill existing ACTIVE sales as fully paid ──────────
    // Sum each sale's line totals (unit_price_cents * quantity) and
    // backfill payment state as though collected in full.
    await queryRunner.query(`
      UPDATE "sales" AS s
      SET
        "amount_paid_cents" = COALESCE(
          (SELECT SUM(sl."unit_price_cents" * sl."quantity")
           FROM "sale_lines" sl
           WHERE sl."sale_id" = s."id"),
          0
        ),
        "pending_balance_cents" = 0,
        "payment_status" = 'paid'
      WHERE s."status" = 'ACTIVE'
    `);

    // Fill remaining rows (non-ACTIVE) with safe defaults in case
    // they had no backfill coverage above.
    await queryRunner.query(`
      UPDATE "sales"
      SET
        "amount_paid_cents" = COALESCE("amount_paid_cents", 0),
        "pending_balance_cents" = COALESCE("pending_balance_cents", 0),
        "payment_status" = COALESCE("payment_status", 'paid')
    `);

    // ── 3. Add NOT NULL constraints ─────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "amount_paid_cents" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "pending_balance_cents" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "payment_status" SET NOT NULL
    `);

    // ── 4. Defaults for future inserts ──────────────────────────
    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "amount_paid_cents" SET DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "pending_balance_cents" SET DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "payment_status" SET DEFAULT 'paid'
    `);

    // ── 5. Check constraint ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD CONSTRAINT "CHK_sales_payment_status"
      CHECK ("payment_status" IN ('pending', 'partial', 'paid'))
    `);

    // ── 6. Indexes ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX "idx_sales_payment_status"
      ON "sales" ("payment_status")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_sales_created_at_desc"
      ON "sales" ("created_at" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_created_at_desc"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sales_payment_status"`);

    // Drop check constraint
    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "CHK_sales_payment_status"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "settled_at"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "payment_status"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "pending_balance_cents"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "amount_paid_cents"`);
  }
}
