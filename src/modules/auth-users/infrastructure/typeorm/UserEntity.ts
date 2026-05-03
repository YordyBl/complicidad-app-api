/**
 * TypeORM entity for the `users` table.
 *
 * ⚠️ This file lives in infrastructure because it extends TypeORM's BaseEntity.
 * The domain `User` is pure — use `UserMapper` to convert between them.
 */
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'users' })
export class UserEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50, default: 'employee' })
  role!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
