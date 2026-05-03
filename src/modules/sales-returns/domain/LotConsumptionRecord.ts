/**
 * Value object / entity within the Sale aggregate.
 *
 * Records the consumption of a specific purchase lot (FIFO lot)
 * by a sale line. These records are the audit trail for returns
 * and cancellations in Phase 7.
 *
 * Each record preserves:
 * - The exact purchase lot ID (for future restoration)
 * - The quantity consumed from that lot
 * - The frozen unit cost at time of sale
 * - The subtotal (quantity * unitCost)
 */
import type { Money } from '../../../shared/domain/Money.js';

export class LotConsumptionRecord {
  constructor(
    private readonly _id: string,
    private readonly _purchaseLotId: string,
    private readonly _quantity: number,
    private readonly _unitCost: Money,
    private readonly _subtotal: Money,
  ) {}

  // ── Read access ─────────────────────────────────────────────

  get id(): string {
    return this._id;
  }

  get purchaseLotId(): string {
    return this._purchaseLotId;
  }

  get quantity(): number {
    return this._quantity;
  }

  get unitCost(): Money {
    return this._unitCost;
  }

  get subtotal(): Money {
    return this._subtotal;
  }

  toString(): string {
    return `LotConsumptionRecord(id=${this._id}, lot=${this._purchaseLotId}, qty=${String(this._quantity)}, cost=${this._unitCost.toString()})`;
  }
}
