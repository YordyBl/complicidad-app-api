/**
 * TypeORM entity for the `inventory_lot_adjustments` table.
 *
 * Immutable append-only ledger. Each row records one adjustment action
 * with full before/after snapshots for auditability. Rows are never
 * mutated or deleted — corrections create new rows.
 */
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'inventory_lot_adjustments' })
export class InventoryLotAdjustmentEntity extends BaseEntity {
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Column({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId!: string | null;

  @Column({ name: 'action', type: 'varchar', length: 30 })
  action!: string;

  @Column({ name: 'before_quantity', type: 'int' })
  beforeQuantity!: number;

  @Column({ name: 'after_quantity', type: 'int' })
  afterQuantity!: number;

  @Column({ name: 'before_unit_cost_cents', type: 'int' })
  beforeUnitCostCents!: number;

  @Column({ name: 'after_unit_cost_cents', type: 'int' })
  afterUnitCostCents!: number;

  @Column({ name: 'delta_quantity', type: 'int' })
  deltaQuantity!: number;

  @Column({ name: 'reason', type: 'text' })
  reason!: string;

  @Column({ name: 'actor_id', type: 'varchar', length: 255 })
  actorId!: string;

  @Column({ name: 'actor_source', type: 'varchar', length: 100 })
  actorSource!: string;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt!: Date;

  @Column({ name: 'effective_at', type: 'timestamptz' })
  effectiveAt!: Date;

  @Column({ name: 'correlation_id', type: 'varchar', length: 255, nullable: true })
  correlationId!: string | null;
}
