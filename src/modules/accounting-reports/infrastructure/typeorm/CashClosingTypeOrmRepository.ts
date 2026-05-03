/**
 * TypeORM-backed implementation of the CashClosingRepository port.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { CashClosingRepository } from '../../domain/CashClosingRepository.js';
import type { CashClosing } from '../../domain/CashClosing.js';
import { CashClosingEntity } from './CashClosingEntity.js';
import { CashClosingMapper } from './CashClosingMapper.js';

export class CashClosingTypeOrmRepository implements CashClosingRepository {
  private readonly repo: Repository<CashClosingEntity>;
  private readonly mapper = new CashClosingMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(CashClosingEntity);
  }

  async save(closing: CashClosing): Promise<void> {
    const entity = this.mapper.toPersistence(closing);
    await this.repo.save(entity);
  }

  async findLast(): Promise<CashClosing | null> {
    const entity = await this.repo.findOne({
      order: { closedAt: 'DESC' },
    });
    return entity ? this.mapper.toDomain(entity) : null;
  }
}
