/**
 * Mapper between the domain `InventoryLotAdjustment` and the TypeORM
 * `InventoryLotAdjustmentEntity`.
 *
 * Converts between the immutable domain record and the flat-persisted
 * append-only ledger row.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { InventoryLotAdjustment } from '../../domain/InventoryLotAdjustment.js';
import { InventoryLotAdjustmentId } from '../../domain/InventoryLotAdjustmentId.js';
import type { AdjustmentSnapshot } from '../../domain/InventoryLotAdjustment.js';
import { InventoryLotAdjustmentEntity } from './InventoryLotAdjustmentEntity.js';

export class InventoryLotAdjustmentMapper implements BaseMapper<InventoryLotAdjustment, InventoryLotAdjustmentEntity> {
  toDomain(entity: InventoryLotAdjustmentEntity): InventoryLotAdjustment {
    const snapshot: AdjustmentSnapshot = {
      variantId: entity.variantId,
      lotId: entity.lotId,
      action: entity.action as AdjustmentSnapshot['action'],
      beforeQuantity: entity.beforeQuantity,
      afterQuantity: entity.afterQuantity,
      beforeUnitCostCents: entity.beforeUnitCostCents,
      afterUnitCostCents: entity.afterUnitCostCents,
      deltaQuantity: entity.deltaQuantity,
      reason: entity.reason,
      actorId: entity.actorId,
      actorSource: entity.actorSource,
      requestedAt: entity.requestedAt,
      effectiveAt: entity.effectiveAt,
      correlationId: entity.correlationId,
    };

    return InventoryLotAdjustment.fromPersistence(
      InventoryLotAdjustmentId.from(entity.id),
      snapshot,
      entity.createdAt,
    );
  }

  toPersistence(domain: InventoryLotAdjustment): InventoryLotAdjustmentEntity {
    const entity = new InventoryLotAdjustmentEntity();
    entity.id = domain.id.toString();
    entity.variantId = domain.snapshot.variantId;
    entity.lotId = domain.snapshot.lotId;
    entity.action = domain.snapshot.action;
    entity.beforeQuantity = domain.snapshot.beforeQuantity;
    entity.afterQuantity = domain.snapshot.afterQuantity;
    entity.beforeUnitCostCents = domain.snapshot.beforeUnitCostCents;
    entity.afterUnitCostCents = domain.snapshot.afterUnitCostCents;
    entity.deltaQuantity = domain.snapshot.deltaQuantity;
    entity.reason = domain.snapshot.reason;
    entity.actorId = domain.snapshot.actorId;
    entity.actorSource = domain.snapshot.actorSource;
    entity.requestedAt = domain.snapshot.requestedAt;
    entity.effectiveAt = domain.snapshot.effectiveAt;
    entity.correlationId = domain.snapshot.correlationId;
    return entity;
  }
}
