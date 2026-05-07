/**
 * TypeORM entity for the `sales` table.
 *
 * The Sale aggregate root. Relates to sale lines via @OneToMany.
 */
import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';
import { SaleLineEntity } from './SaleLineEntity.js';

@Entity({ name: 'sales' })
export class SaleEntity extends BaseEntity {
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'channel_reference', type: 'varchar', length: 255, nullable: true })
  channelReference!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'web' })
  channel!: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: string;

  @OneToMany(() => SaleLineEntity, (line) => line.sale, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  lines!: SaleLineEntity[];
}
