/**
 * TypeORM-backed implementation of the UserRepository port.
 *
 * Lives in infrastructure — the domain only depends on the port interface.
 */
import { Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { UserRepository } from '../../domain/UserRepository.js';
import type { User } from '../../domain/User.js';
import type { UserId } from '../../domain/UserId.js';
import { UserEntity } from './UserEntity.js';
import { UserMapper } from './UserMapper.js';

export class UserTypeOrmRepository implements UserRepository {
  private readonly repo: Repository<UserEntity>;
  private readonly mapper = new UserMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(UserEntity);
  }

  async findById(id: UserId): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { email } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async save(user: User): Promise<void> {
    const entity = this.mapper.toPersistence(user);
    await this.repo.save(entity);
  }

  async delete(id: UserId): Promise<void> {
    await this.repo.delete(id.toString());
  }

  async findAll(): Promise<User[]> {
    const entities = await this.repo.find();
    return entities.map((e) => this.mapper.toDomain(e));
  }
}
