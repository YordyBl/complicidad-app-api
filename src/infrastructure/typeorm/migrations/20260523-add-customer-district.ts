/**
 * Migration: Add district column to customers table.
 *
 * The district field stores a neighbourhood or district value
 * (e.g. "CABA", "Palermo") for customer address context.
 * It starts nullable — no backfill required.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerDistrict20260523 implements MigrationInterface {
  name = 'AddCustomerDistrict20260523';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN "district" varchar(100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN "district"
    `);
  }
}
