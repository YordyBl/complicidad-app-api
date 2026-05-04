/**
 * TypeORM-backed implementation of the SaleRepository port.
 *
 * Persists the full Sale aggregate (sale + lines + consumptions).
 * Phase 8: Added findByCustomerId for customer history derivation.
 * Phase 9: Added findAll with optional filters for listing sales.
 */
import { Repository, type EntityManager, LessThanOrEqual, MoreThanOrEqual, Between, type FindOptionsWhere } from 'typeorm';
import type { SaleRepository, SaleFilters } from '../../domain/SaleRepository.js';
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

  async findAll(filters?: SaleFilters): Promise<Sale[]> {
    const where: FindOptionsWhere<SaleEntity> = {};

    if (filters?.customerId) {
      where.customerId = filters.customerId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    // Build date range filter
    const fromDate = filters?.dateFrom ? new Date(filters.dateFrom) : null;
    const toDateRaw = filters?.dateTo ? new Date(filters.dateTo) : null;
    const toDate = toDateRaw && !isNaN(toDateRaw.getTime())
      ? new Date(toDateRaw.getFullYear(), toDateRaw.getMonth(), toDateRaw.getDate(), 23, 59, 59, 999)
      : null;

    if (fromDate && !isNaN(fromDate.getTime()) && toDate) {
      where.createdAt = Between(fromDate, toDate);
    } else if (fromDate && !isNaN(fromDate.getTime())) {
      where.createdAt = MoreThanOrEqual(fromDate);
    } else if (toDate) {
      where.createdAt = LessThanOrEqual(toDate);
    }

    const sortOrder = filters?.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const entities = await this.repo.find({
      where,
      relations: ['lines', 'lines.consumptions'],
      order: { createdAt: sortOrder },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }
}
