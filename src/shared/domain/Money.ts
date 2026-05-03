/**
 * Money value object.
 *
 * Represents an exact monetary amount in integer cents to prevent
 * floating-point accounting errors. All arithmetic is exact integer math.
 *
 * Construct via static factories — the constructor is private.
 *
 * @example
 * ```ts
 * const price = Money.fromDecimal('12.50');   // 1250 cents
 * const tax   = Money.fromCents(250);          // 250 cents
 * price.add(tax).toDecimalString();           // "15.00"
 * ```
 */
export class Money {
  /** Internal representation: amount in integer cents. Always an integer. */
  private readonly _cents: number;

  private constructor(cents: number) {
    if (!Number.isInteger(cents)) {
      throw new MoneyError(`Money must be constructed with integer cents, got ${String(cents)}`);
    }
    this._cents = cents;

    // Freeze for immutability
    Object.freeze(this);
  }

  // ── Static factories ──────────────────────────────────────────────

  /** A zero-cents Money constant. */
  static readonly ZERO: Money = new Money(0);

  /** Create from a whole number of cents (must be an integer). */
  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  /**
   * Create from a decimal string like "12.50" or "-3.99".
   * Accepts up to 2 decimal places (fractional cents are rejected).
   */
  static fromDecimal(decimal: string): Money {
    const trimmed = decimal.trim();
    const match = /^-?\d+(\.\d{1,2})?$/.exec(trimmed);
    if (!match) {
      throw new MoneyError(
        `Invalid decimal format: "${decimal}". Expected a number with up to 2 decimal places.`,
      );
    }
    const [whole, fraction] = trimmed.split('.');
    const cents =
      parseInt(whole ?? '0', 10) * 100 +
      (fraction ? parseInt(fraction.padEnd(2, '0'), 10) * Math.sign(parseInt(whole ?? '0', 10) || 1) : 0);
    return new Money(cents);
  }

  // ── Properties ────────────────────────────────────────────────────

  /** The amount in integer cents. */
  get cents(): number {
    return this._cents;
  }

  /** Returns the decimal representation as a string (e.g. "12.50"). */
  toDecimalString(): string {
    const abs = Math.abs(this._cents);
    const whole = Math.floor(abs / 100);
    const frac = abs % 100;
    const sign = this._cents < 0 ? '-' : '';
    return `${sign}${String(whole)}.${frac.toString().padStart(2, '0')}`;
  }

  /** Human-friendly: "$12.50" for positive, "-$12.50" for negative. */
  toString(): string {
    return this._cents < 0 ? `-$${this.toDecimalString().slice(1)}` : `$${this.toDecimalString()}`;
  }

  // ── Arithmetic ────────────────────────────────────────────────────

  add(other: Money): Money {
    return new Money(this._cents + other._cents);
  }

  subtract(other: Money): Money {
    return new Money(this._cents - other._cents);
  }

  /**
   * Multiply by a scalar. The result is rounded to the nearest cent
   * (half-up). This is the only operation that introduces rounding.
   */
  multiply(factor: number): Money {
    const result = Math.round(this._cents * factor);
    return new Money(result);
  }

  /**
   * Divide by a divisor. The result is rounded to the nearest cent
   * (half-up). This is the only operation that introduces rounding.
   */
  divide(divisor: number): Money {
    if (divisor === 0) {
      throw new MoneyError('Cannot divide Money by zero');
    }
    const result = Math.round(this._cents / divisor);
    return new Money(result);
  }

  /** Negate: returns a Money with the same magnitude but opposite sign. */
  negate(): Money {
    return new Money(-this._cents);
  }

  /** Absolute value. */
  abs(): Money {
    return new Money(Math.abs(this._cents));
  }

  // ── Comparators ───────────────────────────────────────────────────

  equals(other: Money): boolean {
    return this._cents === other._cents;
  }

  greaterThan(other: Money): boolean {
    return this._cents > other._cents;
  }

  greaterThanOrEqual(other: Money): boolean {
    return this._cents >= other._cents;
  }

  lessThan(other: Money): boolean {
    return this._cents < other._cents;
  }

  lessThanOrEqual(other: Money): boolean {
    return this._cents <= other._cents;
  }

  // ── Predicates ────────────────────────────────────────────────────

  isPositive(): boolean {
    return this._cents > 0;
  }

  isNegative(): boolean {
    return this._cents < 0;
  }

  isZero(): boolean {
    return this._cents === 0;
  }
}

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}
