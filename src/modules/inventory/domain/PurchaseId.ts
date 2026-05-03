/**
 * Typed identifier for the Purchase aggregate root.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class PurchaseId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): PurchaseId {
    return new PurchaseId(value);
  }

  static generate(): PurchaseId {
    return new PurchaseId(crypto.randomUUID());
  }
}
