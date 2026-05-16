/**
 * Mapper between the domain `CashBox` aggregate and the TypeORM `CashBoxEntity`.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { CashBox } from '../../domain/CashBox.js';
import type { CashBoxStatus } from '../../domain/CashBox.js';
import { CashBoxId } from '../../domain/CashBoxId.js';
import { CashBoxEntity } from './CashBoxEntity.js';

export class CashBoxMapper implements BaseMapper<CashBox, CashBoxEntity> {
  toDomain(entity: CashBoxEntity): CashBox {
    return new CashBox({
      id: CashBoxId.from(entity.id),
      businessDate: entity.businessDate,
      status: entity.status as CashBoxStatus,
      openingBalanceCents: entity.openingBalanceCents,
      currentBalanceCents: entity.currentBalanceCents,
      finalBalanceCents: entity.finalBalanceCents,
      closedAt: entity.closedAt,
      legacy: entity.legacy,
      createdAt: entity.createdAt,
    });
  }

  toPersistence(domain: CashBox): CashBoxEntity {
    const entity = new CashBoxEntity();
    entity.id = domain.id.toString();
    entity.businessDate = domain.businessDate;
    entity.status = domain.status;
    entity.openingBalanceCents = domain.openingBalanceCents;
    entity.currentBalanceCents = domain.currentBalanceCents;
    entity.finalBalanceCents = domain.finalBalanceCents;
    entity.closedAt = domain.closedAt;
    entity.legacy = domain.legacy;
    entity.createdAt = domain.createdAt;
    return entity;
  }
}
