/**
 * TypeORM-backed implementation of the CashBoxRepository port.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import type { CashBox } from '../../domain/CashBox.js';
import type { CashBoxId } from '../../domain/CashBoxId.js';
import { CashBoxEntity } from './CashBoxEntity.js';
import { CashBoxMapper } from './CashBoxMapper.js';

export class CashBoxTypeOrmRepository implements CashBoxRepository {
  private readonly repo: Repository<CashBoxEntity>;
  private readonly mapper = new CashBoxMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(CashBoxEntity);
  }

  async save(box: CashBox): Promise<void> {
    const entity = this.mapper.toPersistence(box);
    await this.repo.save(entity);
  }

  async findByBusinessDate(businessDate: string): Promise<CashBox | null> {
    const entity = await this.repo.findOne({
      where: { businessDate },
    });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findCurrent(): Promise<CashBox | null> {
    const entity = await this.repo.findOne({
      where: { status: 'OPEN' },
      order: { createdAt: 'DESC' },
    });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findById(id: CashBoxId): Promise<CashBox | null> {
    const entity = await this.repo.findOne({
      where: { id: id.toString() },
    });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findAllOrdered(): Promise<CashBox[]> {
    const entities = await this.repo.find({
      order: { businessDate: 'DESC' },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async findLastClosed(): Promise<CashBox | null> {
    const entity = await this.repo.findOne({
      where: { status: 'CLOSED', legacy: false },
      order: { closedAt: 'DESC' },
    });
    return entity ? this.mapper.toDomain(entity) : null;
  }
}
