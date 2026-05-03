/**
 * TypeORM entity for the `suppliers` table.
 */
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'suppliers' })
export class SupplierEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'contact_info', type: 'text', nullable: true })
  contactInfo!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
