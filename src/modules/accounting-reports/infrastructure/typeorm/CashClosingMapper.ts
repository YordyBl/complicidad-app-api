/**
 * Mapper between the domain `CashClosing` and the TypeORM `CashClosingEntity`.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { CashClosing } from '../../domain/CashClosing.js';
import { CashClosingEntity } from './CashClosingEntity.js';

export class CashClosingMapper implements BaseMapper<CashClosing, CashClosingEntity> {
  toDomain(entity: CashClosingEntity): CashClosing {
    return new CashClosing(
      entity.id,
      entity.liquidityCents,
      entity.notes,
      entity.closedAt,
      entity.createdAt,
    );
  }

  toPersistence(domain: CashClosing): CashClosingEntity {
    const entity = new CashClosingEntity();
    entity.id = domain.id;
    entity.liquidityCents = domain.liquidityCents;
    entity.notes = domain.notes;
    entity.closedAt = domain.closedAt;
    return entity;
  }
}
