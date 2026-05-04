/**
 * Sku value object — represents a unique stock-keeping unit identifier.
 *
 * SKUs must be non-empty, trimmed, and lowercase-normalized.
 * Uniqueness is enforced after normalization at the persistence boundary
 * (database unique constraint).
 */
import { err, ok } from '../../../shared/domain/Result.js';
import type { Result } from '../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../shared/domain/errors.js';

const SKU_MAX_LENGTH = 100;

export class SkuError extends BusinessRuleError {
  override readonly name = 'SkuError' as const;
}

export class Sku {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
    Object.freeze(this);
  }

  /**
   * Create a Sku from a raw string value.
   * Validates: non-empty, trimmed, within max length.
   * Normalizes to lowercase for uniqueness.
   */
  static from(value: string): Result<Sku, SkuError> {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return err(new SkuError('SKU cannot be empty'));
    }
    if (trimmed.length > SKU_MAX_LENGTH) {
      return err(new SkuError(`SKU cannot exceed ${String(SKU_MAX_LENGTH)} characters`));
    }
    return ok(new Sku(trimmed.toLowerCase()));
  }

  /** Create from a raw string without validation (for persistence mapping). */
  static fromUnsafe(value: string): Sku {
    return new Sku(value.trim().toLowerCase());
  }

  get value(): string {
    return this._value;
  }

  equals(other: Sku): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
