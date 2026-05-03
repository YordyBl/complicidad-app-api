/**
 * Typed identifier for the Product aggregate root.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class ProductId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): ProductId {
    return new ProductId(value);
  }

  static generate(): ProductId {
    return new ProductId(crypto.randomUUID());
  }
}
