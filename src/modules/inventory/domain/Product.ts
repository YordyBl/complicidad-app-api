/**
 * Pure domain entity for a Product (aggregate root).
 *
 * A Product is a base item template with a public base price and
 * searchable aliases. Each Product has one or more Variants.
 */
import type { Money } from '../../../shared/domain/Money.js';
import type { ProductId } from './ProductId.js';
import type { Alias } from './Alias.js';

export class Product {
  constructor(
    private readonly _id: ProductId,
    private _name: string,
    private _description: string | null,
    private _basePrice: Money,
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

  get basePrice(): Money {
    return this._basePrice;
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

  changeBasePrice(price: Money): void {
    this._basePrice = price;
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
