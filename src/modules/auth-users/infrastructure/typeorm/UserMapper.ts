/**
 * Mapper between the domain `User` and the TypeORM `UserEntity`.
 *
 * Domain entities stay pure — no decorators, no ORM coupling.
 * This mapper bridges the two representations at the infrastructure boundary.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { User } from '../../domain/User.js';
import { UserId } from '../../domain/UserId.js';
import type { UserRole } from '../../domain/UserRole.js';
import { UserEntity } from './UserEntity.js';

export class UserMapper implements BaseMapper<User, UserEntity> {
  toDomain(entity: UserEntity): User {
    return new User(
      UserId.from(entity.id),
      entity.email,
      entity.passwordHash,
      entity.name,
      entity.role as UserRole,
      entity.isActive,
      entity.createdAt,
      entity.updatedAt,
    );
  }

  toPersistence(domain: User): UserEntity {
    const entity = new UserEntity();
    entity.id = domain.id.toString();
    entity.email = domain.email;
    entity.passwordHash = domain.passwordHash;
    entity.name = domain.name;
    entity.role = domain.role;
    entity.isActive = domain.isActive;
    return entity;
  }
}
