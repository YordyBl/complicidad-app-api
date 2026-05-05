/**
 * Migration: Add `channel` column to `sales` table.
 *
 * Steps:
 * 1. Add `channel` as nullable varchar(20) initially
 * 2. Backfill existing rows with 'web' (safe default when channel is unknown)
 * 3. Make `channel` NOT NULL
 *
 * This is additive-only: `channel_reference` is preserved for
 * external platform order IDs / notes.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSaleChannelToSales20260505 implements MigrationInterface {
  name = 'AddSaleChannelToSales20260505';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add column as nullable first
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN "channel" character varying(20)
    `);

    // Step 2: Backfill existing rows with 'web' (safe default)
    await queryRunner.query(`
      UPDATE "sales"
      SET "channel" = 'web'
      WHERE "channel" IS NULL
    `);

    // Step 3: Make NOT NULL
    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "channel" SET NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales" DROP COLUMN "channel"
    `);
  }
}
