/**
 * Pure domain entity for a PurchaseLot (FIFO inventory lot).
 *
 * Each lot represents a quantized batch of stock received together
 * at the same unit cost. Lots are consumed in FIFO order (oldest
 * received date first).
 *
 * Key invariant: remainingQuantity <= purchasedQuantity AND
 * remainingQuantity >= 0 at all times.
 */
import { err, ok } from '../../../shared/domain/Result.js';
import type { Result } from '../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../shared/domain/errors.js';
import type { Money } from '../../../shared/domain/Money.js';
import type { PurchaseLotId } from './PurchaseLotId.js';
import type { VariantId } from './VariantId.js';
import type { PurchaseId } from './PurchaseId.js';
import type { SupplierId } from './SupplierId.js';

// ── Exhaustion type ──────────────────────────────────────────

export type LotStatus = 'OPEN' | 'EXHAUSTED';

// ── Consumption result ───────────────────────────────────────

export interface LotConsumption {
  lotId: string;
  quantity: number;
  unitCost: Money;
  subtotal: Money;
}

// ── Domain error ─────────────────────────────────────────────

export class LotConsumptionError extends BusinessRuleError {
  override readonly name = 'LotConsumptionError' as const;
}

// ── Entity ───────────────────────────────────────────────────

export class PurchaseLot {
  constructor(
    private readonly _id: PurchaseLotId,
    private readonly _variantId: VariantId,
    private readonly _purchaseId: PurchaseId,
    private readonly _purchasedQuantity: number,
    private _remainingQuantity: number,
    private readonly _unitCost: Money,
    private readonly _purchaseDate: Date,
    private _supplierId: SupplierId | null,
  ) {
    if (_remainingQuantity < 0) {
      throw new LotConsumptionError('La cantidad restante no puede ser negativa');
    }
    if (_remainingQuantity > _purchasedQuantity) {
      throw new LotConsumptionError('La cantidad restante no puede superar la cantidad comprada');
    }
    if (_purchasedQuantity <= 0) {
      throw new LotConsumptionError('La cantidad comprada debe ser positiva');
    }
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): PurchaseLotId {
    return this._id;
  }

  get variantId(): VariantId {
    return this._variantId;
  }

  get purchaseId(): PurchaseId {
    return this._purchaseId;
  }

  get purchasedQuantity(): number {
    return this._purchasedQuantity;
  }

  get remainingQuantity(): number {
    return this._remainingQuantity;
  }

  get unitCost(): Money {
    return this._unitCost;
  }

  get purchaseDate(): Date {
    return this._purchaseDate;
  }

  get supplierId(): SupplierId | null {
    return this._supplierId;
  }

  /** Whether this lot has been fully consumed. */
  get isExhausted(): boolean {
    return this._remainingQuantity <= 0;
  }

  /** The current status of this lot. */
  get status(): LotStatus {
    return this.isExhausted ? 'EXHAUSTED' : 'OPEN';
  }

  // ── Behaviour ───────────────────────────────────────────────

  /**
   * Consume a quantity from this lot.
   * Returns a consumption record for audit trail.
   *
   * MUTATION: reduces remainingQuantity. The caller is responsible
   * for persisting the change.
   */
  consume(quantity: number): Result<LotConsumption, LotConsumptionError> {
    if (quantity <= 0) {
      return err(new LotConsumptionError('La cantidad a consumir debe ser positiva'));
    }
    if (quantity > this._remainingQuantity) {
return err(
          new LotConsumptionError(
            `No se pueden consumir ${String(quantity)} unidades del lote ${this._id.toString()}: quedan ${String(this._remainingQuantity)} restantes`,
          ),
        );
    }

    this._remainingQuantity -= quantity;

    return ok({
      lotId: this._id.toString(),
      quantity,
      unitCost: this._unitCost,
      subtotal: this._unitCost.multiply(quantity),
    });
  }

  /**
   * Restore a previously consumed quantity back to this lot.
   * Used by returns/cancellations.
   *
   * MUTATION: increases remainingQuantity.
   */
  restore(quantity: number): void {
    if (quantity <= 0) {
      throw new LotConsumptionError('La cantidad a restaurar debe ser positiva');
    }
    if (this._remainingQuantity + quantity > this._purchasedQuantity) {
      throw new LotConsumptionError(
        `No se pueden restaurar ${String(quantity)} unidades al lote ${this._id.toString()}: superaría la cantidad comprada de ${String(this._purchasedQuantity)}`,
      );
    }
    this._remainingQuantity += quantity;
  }

  toString(): string {
    return `PurchaseLot(id=${this._id.toString()}, variant=${this._variantId.toString()}, remaining=${String(this._remainingQuantity)}/${String(this._purchasedQuantity)}, status=${this.status})`;
  }
}
