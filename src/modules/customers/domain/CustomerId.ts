/**
 * Typed identifier for the Customer aggregate root.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class CustomerId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): CustomerId {
    return new CustomerId(value);
  }

  static generate(): CustomerId {
    return new CustomerId(crypto.randomUUID());
  }
}
