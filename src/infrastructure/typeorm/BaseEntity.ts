/**
 * Base TypeORM entity with common fields.
 *
 * All TypeORM entity classes should extend this to ensure
 * consistent id, createdAt, and updatedAt columns.
 *
 * ⚠️ This file lives in infrastructure because it extends TypeORM's BaseEntity.
 * Domain entities remain pure — use mappers to convert between them.
 */
import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
