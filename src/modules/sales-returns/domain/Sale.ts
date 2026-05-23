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
 *
 * Payment state tracks how much was paid at registration vs. pending
 * settlement. A single later settlement can close the balance.
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

export const PAYMENT_STATUSES = ['pending', 'partial', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ── Errors ───────────────────────────────────────────────────

export class SaleStatusError extends BusinessRuleError {
  override readonly name = 'SaleStatusError' as const;
}

export class SalePaymentError extends BusinessRuleError {
  override readonly name = 'SalePaymentError' as const;
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
    // ── Payment state ──────────────────────────────────────
    private _amountPaid: Money = Money.ZERO,
    private _pendingBalance: Money = Money.ZERO,
    private _paymentStatus: PaymentStatus = 'paid',
    private _settledAt: Date | null = null,
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
    if (!PAYMENT_STATUSES.includes(_paymentStatus)) {
      throw new SalePaymentError(`Estado de pago inválido: "${_paymentStatus}". Debe ser uno de: ${PAYMENT_STATUSES.join(', ')}`);
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

  // ── Payment state ───────────────────────────────────────────

  get amountPaid(): Money {
    return this._amountPaid;
  }

  get pendingBalance(): Money {
    return this._pendingBalance;
  }

  get paymentStatus(): PaymentStatus {
    return this._paymentStatus;
  }

  get settledAt(): Date | null {
    return this._settledAt;
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

  /** Cancel this sale. Throws if already cancelled, returned, or not fully paid. */
  cancel(): void {
    if (this._status === 'CANCELLED') {
      throw new SaleStatusError('La venta ya está cancelada');
    }
    if (this._status === 'RETURNED') {
      throw new SaleStatusError('No se puede cancelar una venta devuelta');
    }
    if (this._paymentStatus !== 'paid') {
      throw new SalePaymentError('No se puede cancelar una venta que no está completamente pagada');
    }
    this._status = 'CANCELLED';
    this._updatedAt = new Date();
  }

  /** Mark this sale as returned (full return). Throws if already returned, cancelled, or not fully paid. */
  markReturned(): void {
    if (this._status === 'RETURNED') {
      throw new SaleStatusError('La venta ya fue devuelta');
    }
    if (this._status === 'CANCELLED') {
      throw new SaleStatusError('No se puede devolver una venta cancelada');
    }
    if (this._paymentStatus !== 'paid') {
      throw new SalePaymentError('No se puede devolver una venta que no está completamente pagada');
    }
    this._status = 'RETURNED';
    this._updatedAt = new Date();
  }

  /**
   * Settle the pending balance — one-time transition to paid.
   *
   * Only allowed when paymentStatus is 'pending' or 'partial'.
   * Marks the sale as fully paid, zeroes pendingBalance, adds
   * the pending amount to amountPaid, and records settledAt.
   */
  settlePendingBalance(settledAt: Date): void {
    if (this._paymentStatus === 'paid') {
      throw new SalePaymentError('La venta ya fue saldada');
    }
    if (this._pendingBalance.cents <= 0) {
      throw new SalePaymentError('La venta no tiene saldo pendiente');
    }
    this._amountPaid = this._amountPaid.add(this._pendingBalance);
    this._pendingBalance = Money.ZERO;
    this._paymentStatus = 'paid';
    this._settledAt = settledAt;
  }

  toString(): string {
    return `Sale(id=${this._id.toString()}, customer=${this._customerId}, channel=${this._channel}, channelRef=${this._channelReference ?? '(none)'}, status=${this._status}, revenue=${this.totalRevenue.toString()}, profit=${this.grossProfit.toString()})`;
  }
}
