/**
 * TypeORM-backed implementation of the SupplierRepository port.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { SupplierRepository } from '../../domain/SupplierRepository.js';
import type { Supplier } from '../../domain/Supplier.js';
import type { SupplierId } from '../../domain/SupplierId.js';
import { SupplierEntity } from './SupplierEntity.js';
import { SupplierMapper } from './SupplierMapper.js';

export class SupplierTypeOrmRepository implements SupplierRepository {
  private readonly repo: Repository<SupplierEntity>;
  private readonly mapper = new SupplierMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(SupplierEntity);
  }

  async findById(id: SupplierId): Promise<Supplier | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async save(supplier: Supplier): Promise<void> {
    const entity = this.mapper.toPersistence(supplier);
    await this.repo.save(entity);
  }

  async delete(id: SupplierId): Promise<void> {
    await this.repo.delete(id.toString());
  }

  async findAllActive(): Promise<Supplier[]> {
    const entities = await this.repo.find({ where: { isActive: true } });
    return entities.map((e) => this.mapper.toDomain(e));
  }
}
