/**
 * Migration: Create sale_constancia_emissions table.
 *
 * Stores immutable snapshots of sale/customer/garment data
 * for each constancia PDF emission. The unique index on
 * (sale_id, emission_number) prevents duplicate emission numbers.
 * Ordered by emission_number desc for history queries.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSaleConstanciaEmissions20260523 implements MigrationInterface {
  name = 'CreateSaleConstanciaEmissions20260523';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sale_constancia_emissions" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sale_id"         uuid NOT NULL,
        "emission_number" integer NOT NULL,
        "issued_at"       timestamptz NOT NULL DEFAULT now(),
        "template_version" varchar(20) NOT NULL DEFAULT 'v1',
        "snapshot_json"   jsonb NOT NULL,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sale_constancia_emissions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_sale_emission_number" UNIQUE ("sale_id", "emission_number")
      );
    `);

    // Index for history queries: most recent emissions first per sale
    await queryRunner.query(`
      CREATE INDEX "idx_sale_emission_sale_id_number_desc"
      ON "sale_constancia_emissions" ("sale_id", "emission_number" DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_sale_emission_sale_id_number_desc"`);
    await queryRunner.query(`DROP TABLE "sale_constancia_emissions"`);
  }
}
