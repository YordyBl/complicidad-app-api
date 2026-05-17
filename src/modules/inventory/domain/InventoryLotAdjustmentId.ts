/**
 * Typed identifier for the InventoryLotAdjustment entity.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class InventoryLotAdjustmentId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): InventoryLotAdjustmentId {
    return new InventoryLotAdjustmentId(value);
  }

  static generate(): InventoryLotAdjustmentId {
    return new InventoryLotAdjustmentId(crypto.randomUUID());
  }
}
