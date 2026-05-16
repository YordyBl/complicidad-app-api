/**
 * Mapper between the domain `CashLedgerEntry` and the TypeORM `CashLedgerEntryEntity`.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { CashLedgerEntry } from '../../domain/CashLedgerEntry.js';
import type { CashEntryType } from '../../domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../domain/CashLedgerEntryId.js';
import { CashBoxId } from '../../domain/CashBoxId.js';
import { Money } from '../../../../shared/domain/Money.js';
import { CashLedgerEntryEntity } from './CashLedgerEntryEntity.js';

export class CashLedgerMapper implements BaseMapper<CashLedgerEntry, CashLedgerEntryEntity> {
  toDomain(entity: CashLedgerEntryEntity): CashLedgerEntry {
    return new CashLedgerEntry(
      CashLedgerEntryId.from(entity.id),
      entity.type as CashEntryType,
      Money.fromCents(entity.amountCents),
      entity.sourceId,
      entity.tag,
      entity.createdAt,
      entity.cashBoxId ? CashBoxId.from(entity.cashBoxId) : null,
      entity.concept,
    );
  }

  toPersistence(domain: CashLedgerEntry): CashLedgerEntryEntity {
    const entity = new CashLedgerEntryEntity();
    entity.id = domain.id.toString();
    entity.type = domain.type;
    entity.amountCents = domain.amount.cents;
    entity.sourceId = domain.sourceId;
    entity.tag = domain.tag;
    entity.cashBoxId = domain.cashBoxId?.toString() ?? null;
    entity.concept = domain.concept;
    return entity;
  }
}
