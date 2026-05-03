/**
 * Clock interface — domain abstraction over system time.
 *
 * Allows tests to inject deterministic timestamps without
 * coupling domain logic to `new Date()` or `Date.now()`.
 *
 * @example
 * ```ts
 * class SystemClock implements Clock {
 *   now(): Date { return new Date(); }
 * }
 *
 * class FixedClock implements Clock {
 *   constructor(private readonly fixed: Date) {}
 *   now(): Date { return this.fixed; }
 * }
 * ```
 */
export interface Clock {
  /** Returns the current point in time. */
  now(): Date;
}

/**
 * Real system clock — the production implementation.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
