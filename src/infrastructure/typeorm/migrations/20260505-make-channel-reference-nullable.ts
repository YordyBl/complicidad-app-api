/**
 * Migration: Make `channel_reference` nullable in `sales` table.
 *
 * Steps:
 * 1. Alter column to drop NOT NULL constraint
 * 2. No data migration needed — existing rows keep their values
 *
 * This is a non-breaking, additive change: existing channel_reference
 * values are preserved for historical compatibility, but new rows may
 * omit the reference.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeChannelReferenceNullable20260505 implements MigrationInterface {
  name = 'MakeChannelReferenceNullable20260505';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "channel_reference" DROP NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Set any NULL rows to an empty string before restoring NOT NULL
    await queryRunner.query(`
      UPDATE "sales"
      SET "channel_reference" = ''
      WHERE "channel_reference" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "channel_reference" SET NOT NULL
    `);
  }
}
