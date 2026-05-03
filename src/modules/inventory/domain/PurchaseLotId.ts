/**
 * Typed identifier for the PurchaseLot (FIFO lot) entity.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class PurchaseLotId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): PurchaseLotId {
    return new PurchaseLotId(value);
  }

  static generate(): PurchaseLotId {
    return new PurchaseLotId(crypto.randomUUID());
  }
}
