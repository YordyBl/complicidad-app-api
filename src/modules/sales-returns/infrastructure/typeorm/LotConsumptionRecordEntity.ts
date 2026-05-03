/**
 * TypeORM entity for the `lot_consumption_records` table.
 *
 * Each record captures the consumption of a specific purchase lot (FIFO lot)
 * by a sale line. These are the audit trail for returns/cancellations.
 */
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';
import { SaleLineEntity } from './SaleLineEntity.js';

@Entity({ name: 'lot_consumption_records' })
export class LotConsumptionRecordEntity extends BaseEntity {
  @ManyToOne(() => SaleLineEntity, (line) => line.consumptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_line_id' })
  saleLine!: SaleLineEntity;

  @Column({ name: 'purchase_lot_id', type: 'uuid' })
  purchaseLotId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_cost_cents', type: 'int' })
  unitCostCents!: number;

  @Column({ name: 'subtotal_cents', type: 'int' })
  subtotalCents!: number;
}
