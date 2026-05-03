/**
 * TypeORM entity for the `variants` table.
 *
 * SKU has a unique constraint at the database level.
 */
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';
import { ProductEntity } from './ProductEntity.js';

@Entity({ name: 'variants' })
export class VariantEntity extends BaseEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku!: string;

  @Column({ type: 'jsonb', default: {} })
  attributes!: Record<string, string>;

  @Column({ name: 'price_cents', type: 'int' })
  priceCents!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
