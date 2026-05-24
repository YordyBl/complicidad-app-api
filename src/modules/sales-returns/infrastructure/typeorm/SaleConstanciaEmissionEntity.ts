/**
 * TypeORM entity for the `sale_constancia_emissions` table.
 *
 * Each row represents one emission of a constancia PDF for a sale.
 * The snapshot_json column stores an immutable frozen copy of
 * the sale/customer/garment data at the moment of emission,
 * enabling faithful reprints regardless of later data changes.
 */
import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'sale_constancia_emissions' })
@Index(['saleId', 'emissionNumber'], { unique: true })
export class SaleConstanciaEmissionEntity extends BaseEntity {
  @Column({ name: 'sale_id', type: 'uuid' })
  saleId!: string;

  @Column({ name: 'emission_number', type: 'integer' })
  emissionNumber!: number;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'template_version', type: 'varchar', length: 20 })
  templateVersion!: string;

  @Column({ name: 'snapshot_json', type: 'jsonb' })
  snapshotJson!: Record<string, unknown>;
}
