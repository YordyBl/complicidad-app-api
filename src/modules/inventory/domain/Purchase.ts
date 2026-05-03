/**
 * Pure domain entity for a Purchase (aggregate root).
 *
 * Represents a stock receipt — the act of receiving inventory from
 * a supplier or restock source. A Purchase creates one or more
 * PurchaseLots that feed into FIFO inventory.
 */
import type { PurchaseId } from './PurchaseId.js';
import type { SupplierId } from './SupplierId.js';

export class Purchase {
  constructor(
    private readonly _id: PurchaseId,
    private _supplierId: SupplierId | null,
    private _notes: string | null,
    private readonly _purchaseDate: Date,
    private readonly _createdAt: Date,
  ) {
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): PurchaseId {
    return this._id;
  }

  get supplierId(): SupplierId | null {
    return this._supplierId;
  }

  get notes(): string | null {
    return this._notes;
  }

  get purchaseDate(): Date {
    return this._purchaseDate;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  toString(): string {
    return `Purchase(id=${this._id.toString()}, date=${this._purchaseDate.toISOString()})`;
  }
}
