/**
 * TypeORM-backed implementation of the VariantRepository port.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { VariantRepository } from '../../domain/VariantRepository.js';
import type { Variant } from '../../domain/Variant.js';
import type { VariantId } from '../../domain/VariantId.js';
import type { ProductId } from '../../domain/ProductId.js';
import type { Sku } from '../../domain/Sku.js';
import { VariantEntity } from './VariantEntity.js';
import { VariantMapper } from './VariantMapper.js';

export class VariantTypeOrmRepository implements VariantRepository {
  private readonly repo: Repository<VariantEntity>;
  private readonly mapper = new VariantMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(VariantEntity);
  }

  async findById(id: VariantId): Promise<Variant | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findBySku(sku: Sku): Promise<Variant | null> {
    const entity = await this.repo.findOne({ where: { sku: sku.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByProductId(productId: ProductId): Promise<Variant[]> {
    const entities = await this.repo.find({
      where: { productId: productId.toString() },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async save(variant: Variant): Promise<void> {
    const entity = this.mapper.toPersistence(variant);
    await this.repo.save(entity);
  }

  async delete(id: VariantId): Promise<void> {
    await this.repo.delete(id.toString());
  }
}
