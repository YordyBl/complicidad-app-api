/**
 * Discriminated Result type for explicit error handling without exceptions.
 *
 * Inspired by Rust's Result<T, E>. Use this in domain and application layers
 * to make failure paths explicit in the type system.
 *
 * @example
 * ```ts
 * function divide(a: number, b: number): Result<number, DivisionError> {
 *   if (b === 0) return err(new DivisionError('Cannot divide by zero'));
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log(result.value); // 5
 * } else {
 *   console.error(result.error); // never reached here
 * }
 * ```
 */

// ── Types ───────────────────────────────────────────────────────────

export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

// ── Ok Variant ──────────────────────────────────────────────────────

export class Ok<T, E = Error> {
  readonly ok = true as const;
  readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  /** Unwrap the value or throw if Err (use only when you're certain). */
  unwrap(): T {
    return this.value;
  }

  /** Unwrap or return a default value. */
  unwrapOr(_defaultValue: T): T {
    return this.value;
  }

  /** Map the value through a transform. */
  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok(fn(this.value));
  }

  /** Map the error (no-op for Ok). */
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return this as unknown as Result<T, F>;
  }

  /** Chain another Result-returning function. */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }
}

// ── Err Variant ─────────────────────────────────────────────────────

export class Err<T, E = Error> {
  readonly ok = false as const;
  readonly error: E;

  constructor(error: E) {
    this.error = error;
  }

  /** Unwrap the value — throws the stored error. */
  unwrap(): T {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw this.error;
  }

  /** Unwrap or return a default value. */
  unwrapOr(_defaultValue: T): T {
    return _defaultValue;
  }

  /** Map the value (no-op for Err). */
  map<U>(_fn: (value: T) => U): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  /** Map the error. */
  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err(fn(this.error));
  }

  /** Chain another Result-returning function (no-op for Err). */
  flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return this as unknown as Result<U, E>;
  }
}

// ── Constructor helpers ─────────────────────────────────────────────

/** Wrap a value in Ok. */
export function ok<T, E = Error>(value: T): Ok<T, E> {
  return new Ok(value);
}

/** Wrap an error in Err. */
export function err<T, E = Error>(error: E): Err<T, E> {
  return new Err(error);
}
