/**
 * TypeORM-backed implementation of the PurchaseRepository port.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { PurchaseRepository } from '../../domain/PurchaseRepository.js';
import type { Purchase } from '../../domain/Purchase.js';
import type { PurchaseId } from '../../domain/PurchaseId.js';
import { PurchaseEntity } from './PurchaseEntity.js';
import { PurchaseMapper } from './PurchaseMapper.js';

export class PurchaseTypeOrmRepository implements PurchaseRepository {
  private readonly repo: Repository<PurchaseEntity>;
  private readonly mapper = new PurchaseMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(PurchaseEntity);
  }

  async findById(id: PurchaseId): Promise<Purchase | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async save(purchase: Purchase): Promise<void> {
    const entity = this.mapper.toPersistence(purchase);
    await this.repo.save(entity);
  }

  async delete(id: PurchaseId): Promise<void> {
    await this.repo.delete(id.toString());
  }
}
