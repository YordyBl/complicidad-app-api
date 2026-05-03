/**
 * Typed identifier for the SaleLine entity.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class SaleLineId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): SaleLineId {
    return new SaleLineId(value);
  }

  static generate(): SaleLineId {
    return new SaleLineId(crypto.randomUUID());
  }
}
