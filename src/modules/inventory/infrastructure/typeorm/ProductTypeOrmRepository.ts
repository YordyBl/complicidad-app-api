/**
 * TypeORM-backed implementation of the ProductRepository port.
 */
import { Repository, type EntityManager, Like } from 'typeorm';
import type { ProductRepository } from '../../domain/ProductRepository.js';
import type { Product } from '../../domain/Product.js';
import type { ProductId } from '../../domain/ProductId.js';
import { ProductEntity } from './ProductEntity.js';
import { ProductMapper } from './ProductMapper.js';

export class ProductTypeOrmRepository implements ProductRepository {
  private readonly repo: Repository<ProductEntity>;
  private readonly mapper = new ProductMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(ProductEntity);
  }

  async findById(id: ProductId): Promise<Product | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByAlias(alias: string): Promise<Product[]> {
    // Search both name and aliases column for the alias term
    const entities = await this.repo.find({
      where: [
        { name: Like(`%${alias}%`) },
        { aliases: Like(`%${alias}%`) },
      ],
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async save(product: Product): Promise<void> {
    const entity = this.mapper.toPersistence(product);
    await this.repo.save(entity);
  }

  async delete(id: ProductId): Promise<void> {
    await this.repo.delete(id.toString());
  }

  async findAllActive(): Promise<Product[]> {
    const entities = await this.repo.find({ where: { isActive: true } });
    return entities.map((e) => this.mapper.toDomain(e));
  }
}
