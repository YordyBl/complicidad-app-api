/**
 * TypeORM entity for the `inventory_lots` table.
 *
 * Each row represents a FIFO stock lot. The `remaining_quantity`
 * column is updated atomically within transactions to prevent overselling.
 */
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';
import { VariantEntity } from './VariantEntity.js';

@Entity({ name: 'inventory_lots' })
export class InventoryLotEntity extends BaseEntity {
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @ManyToOne(() => VariantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant!: VariantEntity;

  @Column({ name: 'purchase_id', type: 'uuid' })
  purchaseId!: string;

  @Column({ name: 'purchased_quantity', type: 'int' })
  purchasedQuantity!: number;

  @Column({ name: 'remaining_quantity', type: 'int' })
  remainingQuantity!: number;

  @Column({ name: 'unit_cost_cents', type: 'int' })
  unitCostCents!: number;

  @Column({ name: 'purchase_date', type: 'timestamptz' })
  purchaseDate!: Date;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId!: string | null;
}
