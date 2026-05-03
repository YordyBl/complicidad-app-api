/**
 * TypeORM-backed implementation of the InventoryLotRepository port.
 *
 * Provides FIFO-ordered lot queries with optional row-level locking
 * for concurrency-safe stock consumption.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { InventoryLotRepository } from '../../domain/InventoryLotRepository.js';
import type { PurchaseLot } from '../../domain/PurchaseLot.js';
import type { PurchaseLotId } from '../../domain/PurchaseLotId.js';
import type { VariantId } from '../../domain/VariantId.js';
import { InventoryLotEntity } from './InventoryLotEntity.js';
import { InventoryLotMapper } from './InventoryLotMapper.js';

export class InventoryLotTypeOrmRepository implements InventoryLotRepository {
  private readonly repo: Repository<InventoryLotEntity>;
  private readonly mapper = new InventoryLotMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(InventoryLotEntity);
  }

  async findById(id: PurchaseLotId): Promise<PurchaseLot | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByIds(ids: PurchaseLotId[]): Promise<PurchaseLot[]> {
    const stringIds = ids.map((id) => id.toString());
    const entities = await this.repo
      .createQueryBuilder('lot')
      .where('lot.id IN (:...ids)', { ids: stringIds })
      .getMany();
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async findByVariantIdOrderedByDate(
    variantId: VariantId,
    lock = false,
  ): Promise<PurchaseLot[]> {
    const queryBuilder = this.repo
      .createQueryBuilder('lot')
      .where('lot.variantId = :variantId', { variantId: variantId.toString() })
      .orderBy('lot.purchaseDate', 'ASC')
      .addOrderBy('lot.createdAt', 'ASC');

    if (lock) {
      queryBuilder.setLock('pessimistic_write');
    }

    const entities = await queryBuilder.getMany();
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async save(lot: PurchaseLot): Promise<void> {
    const entity = this.mapper.toPersistence(lot);
    await this.repo.save(entity);
  }

  async saveMany(lots: PurchaseLot[]): Promise<void> {
    const entities = lots.map((l) => this.mapper.toPersistence(l));
    await this.repo.save(entities);
  }

  async delete(id: PurchaseLotId): Promise<void> {
    await this.repo.delete(id.toString());
  }
}
