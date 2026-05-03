/**
 * Typed identifier for the Supplier aggregate root.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class SupplierId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): SupplierId {
    return new SupplierId(value);
  }

  static generate(): SupplierId {
    return new SupplierId(crypto.randomUUID());
  }
}
