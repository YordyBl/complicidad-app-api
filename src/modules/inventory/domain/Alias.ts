/**
 * Alias value object — an alternative searchable name for a Product.
 *
 * Aliases are trimmed, lowercased, and must be non-empty.
 */
import { err, ok } from '../../../shared/domain/Result.js';
import type { Result } from '../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../shared/domain/errors.js';

const ALIAS_MAX_LENGTH = 255;

export class AliasError extends BusinessRuleError {
  override readonly name = 'AliasError' as const;
}

export class Alias {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
    Object.freeze(this);
  }

  static from(value: string): Result<Alias, AliasError> {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) {
      return err(new AliasError('Alias cannot be empty'));
    }
    if (trimmed.length > ALIAS_MAX_LENGTH) {
      return err(new AliasError(`Alias cannot exceed ${String(ALIAS_MAX_LENGTH)} characters`));
    }
    return ok(new Alias(trimmed));
  }

  static fromUnsafe(value: string): Alias {
    return new Alias(value.trim().toLowerCase());
  }

  get value(): string {
    return this._value;
  }

  equals(other: Alias): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
