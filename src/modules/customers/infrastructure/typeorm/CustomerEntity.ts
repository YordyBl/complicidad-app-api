/**
 * TypeORM entity for the `customers` table.
 *
 * Phase 8: Added alias, address, google_maps_url, notes columns.
 */
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'customers' })
export class CustomerEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  alias!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'google_maps_url', type: 'text', nullable: true })
  googleMapsUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
