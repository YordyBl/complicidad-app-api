/**
 * Repository port for the Sale aggregate.
 *
 * Defined in the domain layer so use cases depend on an interface.
 * The save method persists the entire aggregate (sale + lines + consumptions).
 */
import type { Sale } from './Sale.js';
import type { SaleId } from './SaleId.js';

// ── Filter types ──────────────────────────────────────────────

export interface SaleFilters {
  customerId?: string;
  status?: 'ACTIVE' | 'CANCELLED' | 'RETURNED';
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Repository port ───────────────────────────────────────────

export interface SaleRepository {
  /** Persist a sale (insert or update). Includes lines and consumptions. */
  save(sale: Sale): Promise<void>;

  /** Find a sale by its unique identifier. */
  findById(id: SaleId): Promise<Sale | null>;

  /** Find all sales for a given customer, ordered by creation date ascending. */
  findByCustomerId(customerId: string): Promise<Sale[]>;

  /**
   * Find sales by their unique identifiers (batch lookup).
   * Returns only the sales that were found; missing IDs are silently skipped.
   * Returns an empty array if none of the IDs match or if the input array is empty.
   */
  findByIds(ids: SaleId[]): Promise<Sale[]>;

  /**
   * Find all sales with optional filters.
   * Returns full aggregates with lines and consumptions (same eager-load as findByCustomerId).
   */
  findAll(filters?: SaleFilters): Promise<Sale[]>;
}
