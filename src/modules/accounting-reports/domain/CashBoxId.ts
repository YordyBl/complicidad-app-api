/**
 * Typed identifier for the CashBox aggregate.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class CashBoxId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): CashBoxId {
    return new CashBoxId(value);
  }

  static generate(): CashBoxId {
    return new CashBoxId(crypto.randomUUID());
  }
}
