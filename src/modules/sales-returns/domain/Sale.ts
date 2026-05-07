/**
 * Pure domain entity for a Sale (aggregate root).
 *
 * A Sale represents a transaction with a customer. It requires:
 * - A customer (by ID)
 * - A channel (closed catalog: tiktok | facebook | whatsapp | web | instagram)
 * - An optional channel reference (platform/order link) for historical compatibility
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

export const SALE_CHANNELS = ['tiktok', 'facebook', 'whatsapp', 'web', 'instagram'] as const;
export type SaleChannel = (typeof SALE_CHANNELS)[number];

// ── Error ────────────────────────────────────────────────────

export class SaleStatusError extends BusinessRuleError {
  override readonly name = 'SaleStatusError' as const;
}

// ── Entity ───────────────────────────────────────────────────

export class Sale {
  constructor(
    private readonly _id: SaleId,
    private readonly _customerId: string,
    private readonly _channelReference: string | undefined,
    private readonly _channel: SaleChannel,
    private _lines: SaleLine[],
    private _status: SaleStatus,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {
    // ── Invariants ──────────────────────────────────────────
    if (!SALE_CHANNELS.includes(_channel)) {
      throw new BusinessRuleError(
        `Canal inválido: "${_channel}". Debe ser uno de: ${SALE_CHANNELS.join(', ')}`,
      );
    }
    if (_lines.length === 0) {
      throw new BusinessRuleError('La venta debe tener al menos una línea');
    }
    if (!SALE_STATUSES.includes(_status)) {
      throw new SaleStatusError(`Estado de venta inválido: "${_status}". Debe ser uno de: ${SALE_STATUSES.join(', ')}`);
    }
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): SaleId {
    return this._id;
  }

  get customerId(): string {
    return this._customerId;
  }

  get channelReference(): string | undefined {
    return this._channelReference;
  }

  get channel(): SaleChannel {
    return this._channel;
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
      throw new SaleStatusError('La venta ya está cancelada');
    }
    if (this._status === 'RETURNED') {
      throw new SaleStatusError('No se puede cancelar una venta devuelta');
    }
    this._status = 'CANCELLED';
    this._updatedAt = new Date();
  }

  /** Mark this sale as returned (full return). Throws if already returned or cancelled. */
  markReturned(): void {
    if (this._status === 'RETURNED') {
      throw new SaleStatusError('La venta ya fue devuelta');
    }
    if (this._status === 'CANCELLED') {
      throw new SaleStatusError('No se puede devolver una venta cancelada');
    }
    this._status = 'RETURNED';
    this._updatedAt = new Date();
  }

  toString(): string {
    return `Sale(id=${this._id.toString()}, customer=${this._customerId}, channel=${this._channel}, channelRef=${this._channelReference ?? '(none)'}, status=${this._status}, revenue=${this.totalRevenue.toString()}, profit=${this.grossProfit.toString()})`;
  }
}
