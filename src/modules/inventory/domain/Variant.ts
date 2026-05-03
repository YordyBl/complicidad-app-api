/**
 * Pure domain entity for a Product Variant.
 *
 * A Variant represents a specific version of a Product (e.g. size, color).
 * Each Variant has a unique SKU (at the persistence boundary), its own
 * public price, and attributes describing the variation.
 *
 * Stock is NOT stored directly on the Variant — it is DERIVED from
 * the sum of remaining quantities across all PurchaseLots for this variant.
 */
import type { Money } from '../../../shared/domain/Money.js';
import type { VariantId } from './VariantId.js';
import type { ProductId } from './ProductId.js';
import type { Sku } from './Sku.js';

export class Variant {
  constructor(
    private readonly _id: VariantId,
    private readonly _productId: ProductId,
    private _sku: Sku,
    private _attributes: Record<string, string>,
    private _price: Money,
    private _isActive: boolean,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): VariantId {
    return this._id;
  }

  get productId(): ProductId {
    return this._productId;
  }

  get sku(): Sku {
    return this._sku;
  }

  get attributes(): Readonly<Record<string, string>> {
    return this._attributes;
  }

  get price(): Money {
    return this._price;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Behaviour ───────────────────────────────────────────────

  changeSku(sku: Sku): void {
    this._sku = sku;
    this._updatedAt = new Date();
  }

  changePrice(price: Money): void {
    this._price = price;
    this._updatedAt = new Date();
  }

  setAttribute(key: string, value: string): void {
    this._attributes = { ...this._attributes, [key]: value };
    this._updatedAt = new Date();
  }

  removeAttribute(key: string): void {
    const updated = { ...this._attributes };
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete updated[key];
    this._attributes = updated;
    this._updatedAt = new Date();
  }

  activate(): void {
    this._isActive = true;
    this._updatedAt = new Date();
  }

  deactivate(): void {
    this._isActive = false;
    this._updatedAt = new Date();
  }

  toString(): string {
    return `Variant(id=${this._id.toString()}, sku=${this._sku.toString()}, active=${this._isActive ? 'yes' : 'no'})`;
  }
}
