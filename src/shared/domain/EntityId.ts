/**
 * Base value object for entity identifiers.
 *
 * Ensures all entity IDs in the domain are typed and validated.
 * Subclass per aggregate root for type safety across repository boundaries.
 *
 * @example
 * ```ts
 * class UserId extends EntityId {
 *   static from(value: string): UserId { return new UserId(value); }
 *   // validate uuid format, etc.
 * }
 * ```
 */
export abstract class EntityId {
  private readonly _value: string;

  protected constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new EntityIdError('EntityId no puede estar vacío');
    }
    this._value = value.trim();

    Object.freeze(this);
  }

  /** The raw string value of this ID. */
  get value(): string {
    return this._value;
  }

  /** Two EntityIds are equal if they have the same type and value. */
  equals(other: unknown): boolean {
    if (other === null || other === undefined) return false;
    if (!(other instanceof EntityId)) return false;
    return this.constructor === other.constructor && this._value === other._value;
  }

  /** Serialize to string. */
  toString(): string {
    return this._value;
  }

  /** Serialize to JSON (used by JSON.stringify). */
  toJSON(): string {
    return this._value;
  }
}

export class EntityIdError extends Error {
  override readonly name = 'EntityIdError';
}
