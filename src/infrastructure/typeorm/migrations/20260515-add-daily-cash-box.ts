/**
 * Migration: Add daily cash box support.
 *
 * Steps:
 * 1. Create `cash_boxes` table with unique business date constraint
 * 2. Add `cash_box_id` and `concept` columns to `cash_ledger_entries` (nullable initially)
 * 3. Backfill legacy closed cash boxes per existing ledger Lima business date
 * 4. Create indexes for performance
 *
 * The NOT NULL constraint on `cash_box_id` is deferred to a follow-up migration
 * after verifying backfill balances.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDailyCashBox20260515 implements MigrationInterface {
  name = 'AddDailyCashBox20260515';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Create cash_boxes table ──────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "cash_boxes" (
        "id"                  uuid DEFAULT gen_random_uuid() NOT NULL,
        "business_date"       date NOT NULL,
        "status"              varchar(10) NOT NULL DEFAULT 'OPEN',
        "opening_balance_cents" integer NOT NULL DEFAULT 0,
        "current_balance_cents" integer NOT NULL DEFAULT 0,
        "final_balance_cents"   integer,
        "closed_at"           timestamptz,
        "legacy"              boolean NOT NULL DEFAULT false,
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_boxes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cash_boxes_business_date" UNIQUE ("business_date"),
        CONSTRAINT "CHK_cash_boxes_status" CHECK ("status" IN ('OPEN', 'CLOSED'))
      )
    `);

    // ── 2. Add nullable columns to cash_ledger_entries ──────────
    await queryRunner.query(`
      ALTER TABLE "cash_ledger_entries"
      ADD COLUMN "cash_box_id" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "cash_ledger_entries"
      ADD COLUMN "concept" character varying(255)
    `);

    // ── 3. Backfill legacy closed cash boxes ────────────────────
    // For each unique Lima business date with existing ledger entries,
    // create a CLOSED legacy cash box and attach entries by date.
    //
    // Uses a CTE approach to compute opening and final balances
    // per date from the existing append-only ledger.
    //
    // IMPORTANT: The CORRECT SQL expression for converting a timestamptz
    // column to America/Lima date is:
    //   (created_at AT TIME ZONE 'America/Lima')::date
    //
    // The INCORRECT expression (which was used in an earlier draft) is:
    //   (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima')::date
    //
    // For a timestamptz column, AT TIME ZONE 'America/Lima' directly
    // converts to local Lima time (a bare timestamp), then ::date extracts
    // the date. The double-conversion via UTC corrupts the result for
    // timestamps near the 05:00 UTC (= 00:00 Lima) boundary, producing
    // the wrong business date for entries between 00:00-04:59 UTC.
    //
    // Lima is UTC-5 year-round (no DST).
    await queryRunner.query(`
      WITH date_balances AS (
        SELECT
          (created_at AT TIME ZONE 'America/Lima')::date AS lima_date,
          SUM(amount_cents) AS day_total
        FROM "cash_ledger_entries"
        GROUP BY (created_at AT TIME ZONE 'America/Lima')::date
      ),
      running_balances AS (
        SELECT
          lima_date,
          day_total,
          COALESCE(
            SUM(day_total) OVER (ORDER BY lima_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
            0
          ) AS opening_balance
        FROM date_balances
      ),
      legacy_boxes AS (
        SELECT
          lima_date,
          opening_balance,
          (opening_balance + day_total) AS final_balance
        FROM running_balances
      )
      INSERT INTO "cash_boxes" (
        "business_date",
        "status",
        "opening_balance_cents",
        "current_balance_cents",
        "final_balance_cents",
        "closed_at",
        "legacy",
        "created_at",
        "updated_at"
      )
      SELECT
        lima_date,
        'CLOSED',
        opening_balance,
        final_balance,
        final_balance,
        (lima_date + time '23:59:59') AT TIME ZONE 'America/Lima',
        true,
        now(),
        now()
      FROM legacy_boxes
    `);

    // Attach existing ledger entries to their corresponding legacy cash box
    await queryRunner.query(`
      UPDATE "cash_ledger_entries" AS e
      SET "cash_box_id" = b."id"
      FROM "cash_boxes" AS b
      WHERE b."legacy" = true
        AND (e."created_at" AT TIME ZONE 'America/Lima')::date = b."business_date"
    `);

    // ── 4. Create indexes ───────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX "idx_cash_ledger_entries_box"
      ON "cash_ledger_entries" ("cash_box_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_cash_boxes_business_date"
      ON "cash_boxes" ("business_date" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_cash_boxes_status"
      ON "cash_boxes" ("status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_ledger_entries_box"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_boxes_business_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_boxes_status"`);

    // Remove columns (backfill data is lost but entries remain)
    await queryRunner.query(`
      ALTER TABLE "cash_ledger_entries" DROP COLUMN "cash_box_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "cash_ledger_entries" DROP COLUMN "concept"
    `);

    // Drop cash_boxes table
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_boxes"`);
  }
}
