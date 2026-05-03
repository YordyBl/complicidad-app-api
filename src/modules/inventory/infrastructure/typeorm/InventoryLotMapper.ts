/**
 * Mapper between the domain `PurchaseLot` and the TypeORM `InventoryLotEntity`.
 *
 * The domain entity is called PurchaseLot (reflects business semantics),
 * while the database table is named `inventory_lots` (reflects storage role).
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { PurchaseLot } from '../../domain/PurchaseLot.js';
import { PurchaseLotId } from '../../domain/PurchaseLotId.js';
import { VariantId } from '../../domain/VariantId.js';
import { PurchaseId } from '../../domain/PurchaseId.js';
import { SupplierId } from '../../domain/SupplierId.js';
import { Money } from '../../../../shared/domain/Money.js';
import { InventoryLotEntity } from './InventoryLotEntity.js';

export class InventoryLotMapper implements BaseMapper<PurchaseLot, InventoryLotEntity> {
  toDomain(entity: InventoryLotEntity): PurchaseLot {
    return new PurchaseLot(
      PurchaseLotId.from(entity.id),
      VariantId.from(entity.variantId),
      PurchaseId.from(entity.purchaseId),
      entity.purchasedQuantity,
      entity.remainingQuantity,
      Money.fromCents(entity.unitCostCents),
      entity.purchaseDate,
      entity.supplierId ? SupplierId.from(entity.supplierId) : null,
    );
  }

  toPersistence(domain: PurchaseLot): InventoryLotEntity {
    const entity = new InventoryLotEntity();
    entity.id = domain.id.toString();
    entity.variantId = domain.variantId.toString();
    entity.purchaseId = domain.purchaseId.toString();
    entity.purchasedQuantity = domain.purchasedQuantity;
    entity.remainingQuantity = domain.remainingQuantity;
    entity.unitCostCents = domain.unitCost.cents;
    entity.purchaseDate = domain.purchaseDate;
    entity.supplierId = domain.supplierId?.toString() ?? null;
    return entity;
  }
}
