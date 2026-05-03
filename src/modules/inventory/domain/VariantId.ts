/**
 * Typed identifier for the Variant entity.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class VariantId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): VariantId {
    return new VariantId(value);
  }

  static generate(): VariantId {
    return new VariantId(crypto.randomUUID());
  }
}
