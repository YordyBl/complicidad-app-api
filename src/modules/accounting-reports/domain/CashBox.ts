/**
 * Pure domain aggregate for a daily Cash Box (caja diaria).
 *
 * A CashBox represents one business day's cash operations.
 * It is created OPEN, accumulates movements via currentBalanceCents,
 * and transitions to CLOSED via the close() method.
 *
 * Invariants:
 * - One cash box per business date (enforced by repository/db)
 * - Once CLOSED, cannot be reopened or mutated
 * - All monetary values are integer cents
 * - A CLOSED box MUST have finalBalanceCents and closedAt
 * - An OPEN box MUST NOT have closedAt
 */
import { BusinessRuleError } from '../../../shared/domain/errors.js';
import type { CashBoxId } from './CashBoxId.js';

// ── Status ───────────────────────────────────────────────────

export const CASH_BOX_STATUSES = ['OPEN', 'CLOSED'] as const;

export type CashBoxStatus = (typeof CASH_BOX_STATUSES)[number];

// ── Constructor props interface ──────────────────────────────

export interface CashBoxProps {
  id: CashBoxId;
  businessDate: string; // YYYY-MM-DD in America/Lima
  status: CashBoxStatus;
  openingBalanceCents: number;
  currentBalanceCents: number;
  finalBalanceCents: number | null;
  closedAt: Date | null;
  legacy: boolean;
  createdAt: Date;
}

// ── Aggregate ────────────────────────────────────────────────

export class CashBox {
  private readonly _id: CashBoxId;
  private readonly _businessDate: string;
  private readonly _status: CashBoxStatus;
  private readonly _openingBalanceCents: number;
  private readonly _currentBalanceCents: number;
  private readonly _finalBalanceCents: number | null;
  private readonly _closedAt: Date | null;
  private readonly _legacy: boolean;
  private readonly _createdAt: Date;

  constructor(props: CashBoxProps) {
    this._id = props.id;
    this._businessDate = props.businessDate;
    this._status = props.status;
    this._openingBalanceCents = props.openingBalanceCents;
    this._currentBalanceCents = props.currentBalanceCents;
    this._finalBalanceCents = props.finalBalanceCents;
    this._closedAt = props.closedAt;
    this._legacy = props.legacy;
    this._createdAt = props.createdAt;

    this.assertInvariants();
    Object.freeze(this);
  }

  // ── Getters ──────────────────────────────────────────────────

  get id(): CashBoxId {
    return this._id;
  }

  get businessDate(): string {
    return this._businessDate;
  }

  get status(): CashBoxStatus {
    return this._status;
  }

  get openingBalanceCents(): number {
    return this._openingBalanceCents;
  }

  get currentBalanceCents(): number {
    return this._currentBalanceCents;
  }

  get finalBalanceCents(): number | null {
    return this._finalBalanceCents;
  }

  get closedAt(): Date | null {
    return this._closedAt;
  }

  get legacy(): boolean {
    return this._legacy;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  // ── Predicates ───────────────────────────────────────────────

  isOpen(): boolean {
    return this._status === 'OPEN';
  }

  isClosed(): boolean {
    return this._status === 'CLOSED';
  }

  // ── Behaviour ────────────────────────────────────────────────

  /**
   * Close this cash box with a final balance.
   * Returns a NEW CashBox in CLOSED state — original is unchanged (immutable).
   */
  close(finalBalanceCents: number): CashBox {
    if (this._status === 'CLOSED') {
      throw new BusinessRuleError('La caja ya está cerrada');
    }
    if (!Number.isInteger(finalBalanceCents)) {
      throw new BusinessRuleError('El saldo final debe ser un número entero de centavos');
    }

    return new CashBox({
      id: this._id,
      businessDate: this._businessDate,
      status: 'CLOSED',
      openingBalanceCents: this._openingBalanceCents,
      currentBalanceCents: this._currentBalanceCents,
      finalBalanceCents: finalBalanceCents,
      closedAt: new Date(),
      legacy: this._legacy,
      createdAt: this._createdAt,
    });
  }

  // ── Internal ─────────────────────────────────────────────────

  private assertInvariants(): void {
    if (!this._businessDate || this._businessDate.trim().length === 0) {
      throw new BusinessRuleError('La fecha de negocio es obligatoria');
    }

    if (!CASH_BOX_STATUSES.includes(this._status)) {
      throw new BusinessRuleError(
        `Estado de caja inválido: "${this._status}". Debe ser OPEN o CLOSED`,
      );
    }

    if (!Number.isInteger(this._openingBalanceCents)) {
      throw new BusinessRuleError('El saldo inicial debe ser un número entero de centavos');
    }

    if (!Number.isInteger(this._currentBalanceCents)) {
      throw new BusinessRuleError('El saldo actual debe ser un número entero de centavos');
    }

    if (this._status === 'CLOSED') {
      if (this._finalBalanceCents === null) {
        throw new BusinessRuleError('Una caja cerrada debe tener saldo final');
      }
      if (this._closedAt === null) {
        throw new BusinessRuleError('Una caja cerrada debe tener fecha de cierre');
      }
    }

    if (this._status === 'OPEN' && this._closedAt !== null) {
      throw new BusinessRuleError('Una caja abierta no puede tener fecha de cierre');
    }
  }

  toString(): string {
    return `CashBox(id=${this._id.toString()}, date=${this._businessDate}, status=${this._status})`;
  }
}
