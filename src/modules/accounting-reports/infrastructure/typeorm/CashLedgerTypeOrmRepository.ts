/**
 * TypeORM-backed implementation of the CashLedgerRepository port.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { CashLedgerRepository } from '../../domain/CashLedgerRepository.js';
import type { CashLedgerEntry } from '../../domain/CashLedgerEntry.js';
import type { CashLedgerEntryId } from '../../domain/CashLedgerEntryId.js';
import { CashLedgerEntryEntity } from './CashLedgerEntryEntity.js';
import { CashLedgerMapper } from './CashLedgerMapper.js';

export class CashLedgerTypeOrmRepository implements CashLedgerRepository {
  private readonly repo: Repository<CashLedgerEntryEntity>;
  private readonly mapper = new CashLedgerMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(CashLedgerEntryEntity);
  }

  async append(entry: CashLedgerEntry): Promise<void> {
    const entity = this.mapper.toPersistence(entry);
    await this.repo.save(entity);
  }

  async findById(id: CashLedgerEntryId): Promise<CashLedgerEntry | null> {
    const entity = await this.repo.findOne({
      where: { id: id.toString() },
    });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findAllOrdered(): Promise<CashLedgerEntry[]> {
    const entities = await this.repo.find({
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async findByCashBoxId(cashBoxId: string): Promise<CashLedgerEntry[]> {
    const entities = await this.repo.find({
      where: { cashBoxId },
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }
}
