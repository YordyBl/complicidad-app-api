/**
 * TypeORM-backed implementation of the SaleRepository port.
 *
 * Persists the full Sale aggregate (sale + lines + consumptions).
 * Phase 8: Added findByCustomerId for customer history derivation.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { SaleRepository } from '../../domain/SaleRepository.js';
import type { Sale } from '../../domain/Sale.js';
import type { SaleId } from '../../domain/SaleId.js';
import { SaleEntity } from './SaleEntity.js';
import { SaleMapper } from './SaleMapper.js';

export class SaleTypeOrmRepository implements SaleRepository {
  private readonly repo: Repository<SaleEntity>;
  private readonly mapper = new SaleMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(SaleEntity);
  }

  async save(sale: Sale): Promise<void> {
    const entity = this.mapper.toPersistence(sale);
    await this.repo.save(entity);
  }

  async findById(id: SaleId): Promise<Sale | null> {
    const entity = await this.repo.findOne({
      where: { id: id.toString() },
      relations: ['lines', 'lines.consumptions'],
    });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByCustomerId(customerId: string): Promise<Sale[]> {
    const entities = await this.repo.find({
      where: { customerId },
      relations: ['lines', 'lines.consumptions'],
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }
}
