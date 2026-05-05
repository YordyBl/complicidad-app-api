/**
 * Base domain error classes.
 *
 * All domain-specific errors should extend DomainError to make them
 * distinguishable from infrastructure/system errors in middleware.
 */

export abstract class DomainError extends Error {
  abstract override readonly name: string;
}

/**
 * Thrown when a requested entity is not found.
 */
export class NotFoundError extends DomainError {
  override readonly name = 'NotFoundError';

  constructor(entityName: string, id: string) {
    super(`${entityName} con id "${id}" no encontrado`);
  }
}

/**
 * Thrown when a business rule is violated.
 *
 * Subclass to create specific business rule errors:
 * ```ts
 * class InsufficientStockError extends BusinessRuleError {
 *   override readonly name = 'InsufficientStockError' as const;
 * }
 * ```
 *
 * NOTE: TypeScript strict mode requires subclasses to redeclare `name`
 * with `as const` or a widened type. See `AuthenticationError` for an example.
 */
export class BusinessRuleError extends DomainError {
  override readonly name: string;

  constructor(message?: string) {
    super(message ?? 'Violación de regla de negocio');
    this.name = 'BusinessRuleError';
  }
}

/**
 * Thrown when the system detects an invalid state that should never occur.
 */
export class InvariantError extends DomainError {
  override readonly name = 'InvariantError';
}
