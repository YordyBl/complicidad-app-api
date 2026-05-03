/**
 * Typed identifier for the CashLedgerEntry entity.
 */
import { EntityId } from '../../../shared/domain/EntityId.js';

export class CashLedgerEntryId extends EntityId {
  private constructor(value: string) {
    super(value);
  }

  static from(value: string): CashLedgerEntryId {
    return new CashLedgerEntryId(value);
  }

  static generate(): CashLedgerEntryId {
    return new CashLedgerEntryId(crypto.randomUUID());
  }
}
