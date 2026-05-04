/**
 * TypeORM entity for the `sale_lines` table.
 *
 * Each line belongs to a sale and references a variant.
 * Stores the priceType (regular|presale) and a snapshot of the
 * resolved unitPriceCents at sale time. Line-level lot consumptions
 * are tracked via @OneToMany.
 */
import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';
import { SaleEntity } from './SaleEntity.js';
import { LotConsumptionRecordEntity } from './LotConsumptionRecordEntity.js';

@Entity({ name: 'sale_lines' })
export class SaleLineEntity extends BaseEntity {
  @ManyToOne(() => SaleEntity, (sale) => sale.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale!: SaleEntity;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_price_cents', type: 'int' })
  unitPriceCents!: number;

  @Column({ name: 'price_type', type: 'varchar', length: 10, default: 'regular' })
  priceType!: string;

  @OneToMany(() => LotConsumptionRecordEntity, (record) => record.saleLine, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  consumptions!: LotConsumptionRecordEntity[];
}
