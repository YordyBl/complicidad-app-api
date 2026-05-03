/**
 * Pure domain entity for a Customer (aggregate root).
 *
 * Represents a person or business that purchases from Complicidad.
 * Purchase history is NOT stored here — it is derived from Sales data
 * via the GetCustomerHistoryUseCase.
 *
 * Fields:
 * - name: Required, non-empty display name.
 * - email, phone: Contact information.
 * - alias: Optional nickname/short name for quick reference.
 * - address: Physical or shipping address.
 * - googleMapsUrl: Link to the customer's location on Google Maps.
 * - notes: Free-text notes about the customer.
 */
import { BusinessRuleError } from '../../../shared/domain/errors.js';
import type { CustomerId } from './CustomerId.js';

// ── Error ────────────────────────────────────────────────────

export class CustomerNameError extends BusinessRuleError {
  override readonly name = 'CustomerNameError' as const;
}

// ── Entity ───────────────────────────────────────────────────

export class Customer {
  constructor(
    private readonly _id: CustomerId,
    private _name: string,
    private _email: string | null,
    private _phone: string | null,
    private _alias: string | null,
    private _address: string | null,
    private _googleMapsUrl: string | null,
    private _notes: string | null,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {
    if (!_name || _name.trim().length === 0) {
      throw new CustomerNameError('Customer name is required');
    }
  }

  // ── Read access ─────────────────────────────────────────────

  get id(): CustomerId {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get email(): string | null {
    return this._email;
  }

  get phone(): string | null {
    return this._phone;
  }

  get alias(): string | null {
    return this._alias;
  }

  get address(): string | null {
    return this._address;
  }

  get googleMapsUrl(): string | null {
    return this._googleMapsUrl;
  }

  get notes(): string | null {
    return this._notes;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ── Behaviour ───────────────────────────────────────────────

  /**
   * Update the customer's profile fields.
   * Sets updatedAt to the provided timestamp.
   */
  updateProfile(
    name: string,
    email: string | null,
    phone: string | null,
    alias: string | null,
    address: string | null,
    googleMapsUrl: string | null,
    notes: string | null,
    updatedAt: Date,
  ): void {
    if (!name || name.trim().length === 0) {
      throw new CustomerNameError('Customer name is required');
    }
    this._name = name.trim();
    this._email = email;
    this._phone = phone;
    this._alias = alias;
    this._address = address;
    this._googleMapsUrl = googleMapsUrl;
    this._notes = notes;
    this._updatedAt = updatedAt;
  }

  toString(): string {
    return `Customer(id=${this._id.toString()}, name=${this._name})`;
  }
}
