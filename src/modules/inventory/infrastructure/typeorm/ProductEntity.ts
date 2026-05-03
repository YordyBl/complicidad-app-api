/**
 * TypeORM entity for the `products` table.
 */
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'products' })
export class ProductEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'base_price_cents', type: 'int' })
  basePriceCents!: number;

  @Column({ type: 'simple-array', nullable: true })
  aliases!: string[] | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
