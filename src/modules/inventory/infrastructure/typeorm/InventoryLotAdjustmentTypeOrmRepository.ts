/**
 * TypeORM-backed implementation of the InventoryLotAdjustmentRepository port.
 *
 * Provides append-only persistence for the immutable adjustment ledger.
 * All save operations create new rows — existing rows are never mutated.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { InventoryLotAdjustmentRepository } from '../../domain/InventoryLotAdjustmentRepository.js';
import type { InventoryLotAdjustment } from '../../domain/InventoryLotAdjustment.js';
import type { InventoryLotAdjustmentId } from '../../domain/InventoryLotAdjustmentId.js';
import type { PurchaseLotId } from '../../domain/PurchaseLotId.js';
import type { VariantId } from '../../domain/VariantId.js';
import { InventoryLotAdjustmentEntity } from './InventoryLotAdjustmentEntity.js';
import { InventoryLotAdjustmentMapper } from './InventoryLotAdjustmentMapper.js';

export class InventoryLotAdjustmentTypeOrmRepository implements InventoryLotAdjustmentRepository {
  private readonly repo: Repository<InventoryLotAdjustmentEntity>;
  private readonly mapper = new InventoryLotAdjustmentMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(InventoryLotAdjustmentEntity);
  }

  async save(adjustment: InventoryLotAdjustment): Promise<void> {
    const entity = this.mapper.toPersistence(adjustment);
    await this.repo.save(entity);
  }

  async findByLotId(lotId: PurchaseLotId): Promise<InventoryLotAdjustment[]> {
    const entities = await this.repo.find({
      where: { lotId: lotId.toString() },
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async findByVariantId(variantId: VariantId): Promise<InventoryLotAdjustment[]> {
    const entities = await this.repo.find({
      where: { variantId: variantId.toString() },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async findById(id: InventoryLotAdjustmentId): Promise<InventoryLotAdjustment | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }
}
