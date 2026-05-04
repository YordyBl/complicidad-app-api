/**
 * Read-port contracts for product listing queries.
 *
 * Defined in the domain layer so use cases depend on an interface,
 * not on TypeORM or any other infrastructure library.
 *
 * Following the design's ID-first pagination approach to prevent
 * one-to-many product+variant join corruption.
 */

// ── Query ───────────────────────────────────────────────────

export interface ListProductsQuery {
  /** Page number (1-based, normalized by use case). */
  page: number;
  /** Items per page (normalized by use case, 1–100). */
  pageSize: number;
  /** Optional search term (case-insensitive match on name/aliases). Empty string means no filter. */
  search: string;
  /** Status filter: active, inactive, or all. Normalized by use case. */
  status: 'active' | 'inactive' | 'all';
  /** Sort field. Whitelisted and normalized by use case. */
  sortBy: 'name' | 'createdAt' | 'updatedAt';
  /** Sort direction. Normalized by use case. */
  sortOrder: 'asc' | 'desc';
}

// ── Read Models ─────────────────────────────────────────────

/** Summary of a single variant in the product list context. */
export interface ProductVariantSummary {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  isActive: boolean;
}

/** Flat read model for a product in the listing context. */
export interface ProductListItem {
  id: string;
  name: string;
  description: string | null;
  /** Base SKU for variant generation. */
  baseSku: string;
  /** Regular sale price in soles. */
  salePrice: number;
  /** Presale price in soles (null when not set). */
  presalePrice: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariantSummary[];
}

/** Filters applied to the query (echoed in metadata for transparency). */
export interface ListProductsFilters {
  status: string;
  search: string;
}

/** Pagination metadata returned alongside the product list. */
export interface ListProductsMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  /** Sort field applied (name, createdAt, updatedAt). */
  sortBy: string;
  /** Sort direction applied (asc, desc). */
  sortOrder: string;
  /** Filters applied to the query. */
  filters: ListProductsFilters;
}

/** Full result from the read-port. */
export interface ListProductsResult {
  items: ProductListItem[];
  meta: ListProductsMeta;
}

// ── Repository Port ─────────────────────────────────────────

export interface ProductListReadRepository {
  /**
   * Query products with pagination, search, filters, and sorting.
   *
   * Implementation MUST use DB-backed pagination (count + page IDs)
   * and MUST NOT load all products then slice in memory.
   */
  listProducts(query: ListProductsQuery): Promise<ListProductsResult>;
}
