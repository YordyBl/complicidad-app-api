/**
 * Pure domain entity for a Supplier (aggregate root).
 *
 * Represents an external supplier or internal restock source.
 */
import type { SupplierId } from './SupplierId.js';

export class Supplier {
  constructor(
    private readonly _id: SupplierId,
    private _name: string,
    private _contactInfo: string | null,
    private _isActive: boolean,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): SupplierId {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get contactInfo(): string | null {
    return this._contactInfo;
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

  changeContactInfo(info: string | null): void {
    this._contactInfo = info;
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
    return `Supplier(id=${this._id.toString()}, name=${this._name})`;
  }
}
