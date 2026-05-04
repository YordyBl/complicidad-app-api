/**
 * Pure domain entity for a Product (aggregate root).
 *
 * A Product owns sale and optional presale/preventa prices.
 * Each Product has one or more Variants (sizes). Variants do NOT
 * have their own prices — all pricing is owned by the Product.
 *
 * Sale items reference a variant but the authoritative unit price
 * is resolved from the Product based on priceType (regular|presale).
 */
import type { Money } from '../../../shared/domain/Money.js';
import type { ProductId } from './ProductId.js';
import type { Alias } from './Alias.js';

export class Product {
  constructor(
    private readonly _id: ProductId,
    private _name: string,
    private _description: string | null,
    private readonly _baseSku: string,
    private _salePrice: Money,
    private _presalePrice: Money | null,
    private _aliases: Alias[],
    private _isActive: boolean,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): ProductId {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get description(): string | null {
    return this._description;
  }

  /** Lowercase-normalized base SKU used to generate variant SKUs. */
  get baseSku(): string {
    return this._baseSku;
  }

  /** Regular sale price (never null). */
  get salePrice(): Money {
    return this._salePrice;
  }

  /** Presale/preventa price (null when no presale is active). */
  get presalePrice(): Money | null {
    return this._presalePrice;
  }

  /**
   * Resolve the authoritative unit price for a given price type.
   * Falls back to salePrice when presalePrice is null and priceType is 'presale'.
   */
  resolveUnitPrice(priceType: 'regular' | 'presale'): Money {
    if (priceType === 'presale' && this._presalePrice) {
      return this._presalePrice;
    }
    return this._salePrice;
  }

  get aliases(): readonly Alias[] {
    return this._aliases;
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

  changeName(name: string): void {
    this._name = name;
    this._updatedAt = new Date();
  }

  changeDescription(description: string | null): void {
    this._description = description;
    this._updatedAt = new Date();
  }

  changeSalePrice(price: Money): void {
    this._salePrice = price;
    this._updatedAt = new Date();
  }

  changePresalePrice(price: Money | null): void {
    this._presalePrice = price;
    this._updatedAt = new Date();
  }

  addAlias(alias: Alias): void {
    // Prevent duplicate aliases
    if (!this._aliases.some((a) => a.equals(alias))) {
      this._aliases = [...this._aliases, alias];
      this._updatedAt = new Date();
    }
  }

  removeAlias(alias: Alias): void {
    this._aliases = this._aliases.filter((a) => !a.equals(alias));
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
    return `Product(id=${this._id.toString()}, name=${this._name}, active=${this._isActive ? 'yes' : 'no'})`;
  }
}
