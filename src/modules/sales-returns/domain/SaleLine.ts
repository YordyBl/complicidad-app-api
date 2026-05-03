/**
 * Domain entity — a single line within a Sale.
 *
 * Each SaleLine represents one variant being sold in a specific quantity
 * at a specific unit price. The lot consumptions track exactly which
 * purchase lots were consumed to fulfil this line.
 */
import { BusinessRuleError } from '../../../shared/domain/errors.js';
import { Money } from '../../../shared/domain/Money.js';
import type { SaleLineId } from './SaleLineId.js';
import type { LotConsumptionRecord } from './LotConsumptionRecord.js';

export class SaleLine {
  constructor(
    private readonly _id: SaleLineId,
    private readonly _variantId: string,
    private readonly _quantity: number,
    private readonly _unitPrice: Money,
    private readonly _consumptions: LotConsumptionRecord[],
  ) {
    if (_quantity <= 0) {
      throw new BusinessRuleError('Quantity must be positive');
    }
    if (_unitPrice.cents < 0) {
      throw new BusinessRuleError('Unit price cannot be negative');
    }
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): SaleLineId {
    return this._id;
  }

  get variantId(): string {
    return this._variantId;
  }

  get quantity(): number {
    return this._quantity;
  }

  get unitPrice(): Money {
    return this._unitPrice;
  }

  get consumptions(): readonly LotConsumptionRecord[] {
    return this._consumptions;
  }

  // ── Calculations ────────────────────────────────────────────

  /** Total sale price for this line (quantity * unitPrice). */
  get totalPrice(): Money {
    return this._unitPrice.multiply(this._quantity);
  }

  /** Total cost from all lot consumptions. */
  get totalCost(): Money {
    return this._consumptions.reduce(
      (sum, c) => sum.add(c.subtotal),
      Money.ZERO,
    );
  }

  toString(): string {
    return `SaleLine(id=${this._id.toString()}, variant=${this._variantId}, qty=${String(this._quantity)}, price=${this._unitPrice.toString()})`;
  }
}
