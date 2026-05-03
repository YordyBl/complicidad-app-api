/**
 * TypeORM entity for the `purchases` table.
 */
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'purchases' })
export class PurchaseEntity extends BaseEntity {
  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'purchase_date', type: 'timestamptz' })
  purchaseDate!: Date;
}
