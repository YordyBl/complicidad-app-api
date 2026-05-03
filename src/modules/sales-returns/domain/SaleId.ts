/**
 * Typed identifier for the Sale aggregate root.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class SaleId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): SaleId {
    return new SaleId(value);
  }

  static generate(): SaleId {
    return new SaleId(crypto.randomUUID());
  }
}
