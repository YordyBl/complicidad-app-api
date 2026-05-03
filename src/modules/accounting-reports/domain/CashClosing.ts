/**
 * Pure domain entity for a Cash Closing.
 *
 * A CashClosing records a manual snapshot of the cash ledger balance
 * at a specific point in time. This is used to reconcile cash in the
 * business (future cron compatibility is reserved — v1 is manual only).
 *
 * The closing records:
 * - The liquidity (cash ledger balance) at the time of closing
 * - Optional notes explaining the closing
 * - The timestamp when the closing was performed
 */
import { BusinessRuleError } from '../../../shared/domain/errors.js';

export class CashClosing {
  constructor(
    private readonly _id: string,
    private readonly _liquidityCents: number,
    private readonly _notes: string | null,
    private readonly _closedAt: Date,
    private readonly _createdAt: Date,
  ) {
    if (!Number.isInteger(_liquidityCents)) {
      throw new BusinessRuleError('Liquidity cents must be an integer');
    }
    Object.freeze(this);
  }

  get id(): string {
    return this._id;
  }

  /** The cash ledger balance at the time of closing (in integer cents). */
  get liquidityCents(): number {
    return this._liquidityCents;
  }

  get notes(): string | null {
    return this._notes;
  }

  /** The business timestamp when the closing was performed (may differ from createdAt). */
  get closedAt(): Date {
    return this._closedAt;
  }

  /** The database record creation timestamp. */
  get createdAt(): Date {
    return this._createdAt;
  }

  toString(): string {
    return `CashClosing(id=${this._id}, liquidityCents=${String(this._liquidityCents)}, closedAt=${this._closedAt.toISOString()})`;
  }
}
