/**
 * Domain entity — a single line within a Sale.
 *
 * Each SaleLine represents one variant being sold in a specific quantity
 * at a specific unit price (snapshot resolved by the backend from the
 * Product's current price). The priceType records whether it was a
 * regular or presale price. Lot consumptions track exactly which
 * purchase lots were consumed to fulfil this line.
 */
import { BusinessRuleError } from '../../../shared/domain/errors.js';
import { Money } from '../../../shared/domain/Money.js';
import type { SaleLineId } from './SaleLineId.js';
import type { LotConsumptionRecord } from './LotConsumptionRecord.js';

export type PriceType = 'regular' | 'presale';

export class SaleLine {
  constructor(
    private readonly _id: SaleLineId,
    private readonly _variantId: string,
    private readonly _quantity: number,
    private readonly _unitPrice: Money,
    private readonly _priceType: PriceType,
    private readonly _consumptions: LotConsumptionRecord[],
  ) {
    if (_quantity <= 0) {
      throw new BusinessRuleError('La cantidad debe ser positiva');
    }
    if (_unitPrice.cents < 0) {
      throw new BusinessRuleError('El precio unitario no puede ser negativo');
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

  /** Snapshot of the unit price at sale time (calculated by backend from Product). */
  get unitPrice(): Money {
    return this._unitPrice;
  }

  /** Whether this line used regular or presale pricing. */
  get priceType(): PriceType {
    return this._priceType;
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
