/**
 * Pure domain entity for a Sale (aggregate root).
 *
 * A Sale represents a transaction with a customer. It requires:
 * - A customer (by ID)
 * - A channel reference (platform/order link)
 * - At least one sale line
 *
 * Each line tracks its own FIFO lot consumptions for audit trail.
 * Totals (revenue, cost, gross profit) are derived from lines.
 */
import { BusinessRuleError } from '../../../shared/domain/errors.js';
import { Money } from '../../../shared/domain/Money.js';
import type { SaleId } from './SaleId.js';
import type { SaleLine } from './SaleLine.js';

// ── Types ────────────────────────────────────────────────────

export const SALE_STATUSES = ['ACTIVE', 'CANCELLED', 'RETURNED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

// ── Error ────────────────────────────────────────────────────

export class SaleStatusError extends BusinessRuleError {
  override readonly name = 'SaleStatusError' as const;
}

// ── Entity ───────────────────────────────────────────────────

export class Sale {
  constructor(
    private readonly _id: SaleId,
    private readonly _customerId: string,
    private readonly _channelReference: string,
    private _lines: SaleLine[],
    private _status: SaleStatus,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {
    // ── Invariants ──────────────────────────────────────────
    if (!_channelReference || _channelReference.trim().length === 0) {
      throw new BusinessRuleError('Channel reference is required');
    }
    if (_lines.length === 0) {
      throw new BusinessRuleError('Sale must have at least one line');
    }
    if (!SALE_STATUSES.includes(_status)) {
      throw new SaleStatusError(`Invalid sale status: "${_status}". Must be one of: ${SALE_STATUSES.join(', ')}`);
    }
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): SaleId {
    return this._id;
  }

  get customerId(): string {
    return this._customerId;
  }

  get channelReference(): string {
    return this._channelReference;
  }

  get lines(): readonly SaleLine[] {
    return this._lines;
  }

  get status(): SaleStatus {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Derived totals ──────────────────────────────────────────

  /** Total revenue across all lines (quantity * unitPrice). */
  get totalRevenue(): Money {
    return this._lines.reduce(
      (sum, line) => sum.add(line.totalPrice),
      Money.ZERO,
    );
  }

  /** Total cost across all line consumptions. */
  get totalCost(): Money {
    return this._lines.reduce(
      (sum, line) => sum.add(line.totalCost),
      Money.ZERO,
    );
  }

  /** Gross profit = totalRevenue - totalCost. */
  get grossProfit(): Money {
    return this.totalRevenue.subtract(this.totalCost);
  }

  // ── Behaviour ───────────────────────────────────────────────

  /** Cancel this sale. Throws if already cancelled or returned. */
  cancel(): void {
    if (this._status === 'CANCELLED') {
      throw new SaleStatusError('Sale is already cancelled');
    }
    if (this._status === 'RETURNED') {
      throw new SaleStatusError('Cannot cancel a returned sale');
    }
    this._status = 'CANCELLED';
    this._updatedAt = new Date();
  }

  /** Mark this sale as returned (full return). Throws if already returned or cancelled. */
  markReturned(): void {
    if (this._status === 'RETURNED') {
      throw new SaleStatusError('Sale has already been returned');
    }
    if (this._status === 'CANCELLED') {
      throw new SaleStatusError('Cannot return a cancelled sale');
    }
    this._status = 'RETURNED';
    this._updatedAt = new Date();
  }

  toString(): string {
    return `Sale(id=${this._id.toString()}, customer=${this._customerId}, channel=${this._channelReference}, status=${this._status}, revenue=${this.totalRevenue.toString()}, profit=${this.grossProfit.toString()})`;
  }
}
