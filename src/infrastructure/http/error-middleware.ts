/**
 * Centralized Express error-handling middleware.
 *
 * Catches errors thrown (or forwarded via `next(err)`) from controllers
 * and returns consistent JSON error responses matching the existing
 * `{ error, message }` contract used across all modules.
 *
 * Domain errors (from `src/shared/domain/errors.ts`) are mapped to HTTP
 * status codes:
 * - `NotFoundError`        → 404
 * - `ValidationError`-type → 400  (detected by error name suffix)
 * - Other `DomainError`     → 400
 * - Unexpected errors      → 500 (details hidden in production)
 */
import type { Request, Response, NextFunction } from 'express';
import { DomainError, NotFoundError } from '../../shared/domain/errors.js';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Known HTTP status mappings for domain error types.
 * Add new entries here as error types evolve.
 */
function errorToStatus(err: Error): number {
  if (err instanceof NotFoundError) return 404;

  // Name-based heuristics for errors raised via `Result.err()`
  const name = err.name;
  if (name.endsWith('ValidationError') || name.endsWith('Error')) {
    // If the name ends with "Error" but isn't NotFound, it's a business-rule / validation error
    // Use 400 by default — specific mappings below override.
  }

  return 400;
}

// ── Middleware ─────────────────────────────────────────────────

/**
 * Express error-handling middleware.
 *
 * Signature with 4 parameters is required — Express identifies error
 * middleware by the arity.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Log unexpected errors for debugging
  if (!(err instanceof DomainError)) {
    console.error('[complicidad] UNEXPECTED ERROR:', err);
  }

  const status = err instanceof DomainError ? errorToStatus(err) : 500;

  const body: Record<string, unknown> = {
    error: err.name,
    message: err.message,
  };

  // Include stack trace in development/test for debugging
  if (process.env.NODE_ENV !== 'production') {
    body.stack = err.stack;
  }

  res.status(status).json(body);
}
