/**
 * Pure domain entity for a Cash Ledger Entry.
 *
 * Every financial operation that affects cash creates an immutable
 * entry in the cash ledger. The balance at any point is the sum
 * of all entries.
 *
 * Entry types:
 * - SALE_INCOME: Cash received from a sale (positive)
 * - PURCHASE_OUTFLOW: Cash paid for a purchase/restock (negative)
 * - RETURN_OUTFLOW: Cash refunded for a return (negative)
 * - MANUAL_ADJUSTMENT: Manual cash adjustment (positive or negative)
 * - WITHDRAWAL: Cash withdrawn from the business (negative)
 */
import type { Money } from '../../../shared/domain/Money.js';
import type { CashLedgerEntryId } from './CashLedgerEntryId.js';

export const CASH_ENTRY_TYPES = [
  'SALE_INCOME',
  'PURCHASE_OUTFLOW',
  'RETURN_OUTFLOW',
  'MANUAL_ADJUSTMENT',
  'WITHDRAWAL',
] as const;

export type CashEntryType = (typeof CASH_ENTRY_TYPES)[number];

/** Optional tags for categorising cash entries. */
export const CASH_ENTRY_TAGS = ['REINVESTMENT', 'RESTOCK', 'DRAW'] as const;

export type CashEntryTag = (typeof CASH_ENTRY_TAGS)[number];

export class CashLedgerEntry {
  constructor(
    private readonly _id: CashLedgerEntryId,
    private readonly _type: CashEntryType,
    private readonly _amount: Money,
    /** ID of the source entity (e.g. purchase ID, sale ID). */
    private readonly _sourceId: string,
    private readonly _tag: string | null,
    private readonly _createdAt: Date,
  ) {
    Object.freeze(this);
  }

  get id(): CashLedgerEntryId {
    return this._id;
  }

  get type(): CashEntryType {
    return this._type;
  }

  get amount(): Money {
    return this._amount;
  }

  get sourceId(): string {
    return this._sourceId;
  }

  get tag(): string | null {
    return this._tag;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  toString(): string {
    return `CashLedgerEntry(id=${this._id.toString()}, type=${this._type}, amount=${this._amount.toString()})`;
  }
}
