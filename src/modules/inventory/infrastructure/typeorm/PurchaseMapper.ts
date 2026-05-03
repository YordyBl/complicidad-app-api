/**
 * Mapper between the domain `Purchase` and the TypeORM `PurchaseEntity`.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { Purchase } from '../../domain/Purchase.js';
import { PurchaseId } from '../../domain/PurchaseId.js';
import { SupplierId } from '../../domain/SupplierId.js';
import { PurchaseEntity } from './PurchaseEntity.js';

export class PurchaseMapper implements BaseMapper<Purchase, PurchaseEntity> {
  toDomain(entity: PurchaseEntity): Purchase {
    return new Purchase(
      PurchaseId.from(entity.id),
      entity.supplierId ? SupplierId.from(entity.supplierId) : null,
      entity.notes,
      entity.purchaseDate,
      entity.createdAt,
    );
  }

  toPersistence(domain: Purchase): PurchaseEntity {
    const entity = new PurchaseEntity();
    entity.id = domain.id.toString();
    entity.supplierId = domain.supplierId?.toString() ?? null;
    entity.notes = domain.notes;
    entity.purchaseDate = domain.purchaseDate;
    return entity;
  }
}
