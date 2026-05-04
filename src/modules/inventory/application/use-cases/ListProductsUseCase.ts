/**
 * List Products use case — normalizes query parameters and delegates
 * to the read-port for DB-backed paginated product listing.
 *
 * Responsibilities:
 * - Apply defaults for missing params (page=1, pageSize=20, etc.)
 * - Clamp out-of-range values (page min 1, pageSize max 100)
 * - Normalize enums (unknown → safe default)
 * - Trim search and handle empty search
 * - Call read-port and return result unmodified
 *
 * No Express/TypeORM imports — pure application logic.
 */
import type {
  ProductListReadRepository,
  ListProductsQuery,
  ListProductsResult,
} from '../../domain/ProductListReadRepository.js';
import {
  VALID_STATUSES,
  VALID_SORT_BY,
  VALID_SORT_ORDER,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  DEFAULT_STATUS,
} from './list-products-constants.js';

// ── Input (raw query params from HTTP) ──────────────────────

export interface ListProductsInput {
  page?: string;
  pageSize?: string;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}

// ── Use Case ────────────────────────────────────────────────

export class ListProductsUseCase {
  constructor(
    private readonly readRepository: ProductListReadRepository,
  ) {}

  async execute(input: ListProductsInput = {}): Promise<ListProductsResult> {
    const query = this.normalizeQuery(input);
    return this.readRepository.listProducts(query);
  }

  // ── Normalization (public for testability) ────────────────

  normalizeQuery(input: ListProductsInput): ListProductsQuery {
    return {
      page: this.normalizePage(input.page),
      pageSize: this.normalizePageSize(input.pageSize),
      search: this.normalizeSearch(input.search),
      status: this.normalizeStatus(input.status),
      sortBy: this.normalizeSortBy(input.sortBy),
      sortOrder: this.normalizeSortOrder(input.sortOrder),
    };
  }

  private normalizePage(raw: string | undefined): number {
    if (raw === undefined || raw === '') return DEFAULT_PAGE;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE;
    return n;
  }

  private normalizePageSize(raw: string | undefined): number {
    if (raw === undefined || raw === '') return DEFAULT_PAGE_SIZE;
    const n = Number(raw);
    if (!Number.isInteger(n)) return DEFAULT_PAGE_SIZE;
    if (n < MIN_PAGE_SIZE) return MIN_PAGE_SIZE;
    if (n > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
    return n;
  }

  private normalizeSearch(raw: string | undefined): string {
    if (raw === undefined) return '';
    const trimmed = raw.trim();
    return trimmed;
  }

  private normalizeStatus(raw: string | undefined): 'active' | 'inactive' | 'all' {
    if (raw === undefined) return DEFAULT_STATUS;
    if (VALID_STATUSES.has(raw)) return raw as 'active' | 'inactive' | 'all';
    return DEFAULT_STATUS;
  }

  private normalizeSortBy(raw: string | undefined): 'name' | 'createdAt' | 'updatedAt' {
    if (raw === undefined) return DEFAULT_SORT_BY;
    if (VALID_SORT_BY.has(raw)) return raw as 'name' | 'createdAt' | 'updatedAt';
    return DEFAULT_SORT_BY;
  }

  private normalizeSortOrder(raw: string | undefined): 'asc' | 'desc' {
    if (raw === undefined) return DEFAULT_SORT_ORDER;
    if (VALID_SORT_ORDER.has(raw)) return raw as 'asc' | 'desc';
    return DEFAULT_SORT_ORDER;
  }
}
