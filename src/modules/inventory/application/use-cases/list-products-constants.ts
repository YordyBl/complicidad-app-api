/**
 * Shared constants for product listing query validation and normalization.
 *
 * Used by both the HTTP controller (validation → 400) and the use case
 * (normalization → safe defaults). Kept in application layer because
 * the use case owns the normalization logic; the controller references
 * these constants for pre-validation without importing use-case internals.
 */

/** Valid product status filter values. */
export const VALID_STATUSES = new Set(['active', 'inactive', 'all']);

/** Valid sort fields for product listing. */
export const VALID_SORT_BY = new Set(['name', 'createdAt', 'updatedAt']);

/** Valid sort directions. */
export const VALID_SORT_ORDER = new Set(['asc', 'desc']);

/** Default page number (1-based). */
export const DEFAULT_PAGE = 1;

/** Default items per page. */
export const DEFAULT_PAGE_SIZE = 20;

/** Minimum allowed page size. */
export const MIN_PAGE_SIZE = 1;

/** Maximum allowed page size. */
export const MAX_PAGE_SIZE = 100;

/** Default sort field. */
export const DEFAULT_SORT_BY = 'createdAt' as const;

/** Default sort direction. */
export const DEFAULT_SORT_ORDER = 'desc' as const;

/** Default status filter. */
export const DEFAULT_STATUS = 'active' as const;
