/**
 * Read-port contract for paginated sale listing.
 *
 * Defined in the application layer so ListSalesUseCase depends on an
 * interface rather than on TypeORM or any infrastructure library.
 *
 * This is separate from SaleListItemReadRepository (which loads per-sale
 * item display rows). SaleListReadRepository handles the listing-level
 * concerns: customer join, search, date filtering, sorting by financial
 * columns, and pagination at the SQL level.
 */

// ── Query ────────────────────────────────────────────────────

export interface SaleListQuery {
  /** Page number (1-indexed, default 1). */
  page?: number;
  /** Items per page (default 20). */
  pageSize?: number;
  /** Free-text search on customer name (case-insensitive substring). */
  search?: string;
  /** Include sales created at or after this ISO date. */
  dateFrom?: string;
  /** Include sales created at or before this ISO date. */
  dateTo?: string;
  /** Filter by sale status. */
  status?: 'ACTIVE' | 'CANCELLED' | 'RETURNED';
  /** Filter by payment status. */
  paymentStatus?: 'pending' | 'partial' | 'paid';
  /** Sorting column. */
  sortBy?: 'createdAt' | 'totalRevenueCents' | 'totalCostCents' | 'grossProfitCents';
  /** Sort direction (default desc). */
  sortOrder?: 'asc' | 'desc';
}

// ── Read Models ──────────────────────────────────────────────

export interface SaleListRow {
  saleId: string;
  customerId: string;
  /** Resolved from customers.name via LEFT JOIN. */
  customerName: string;
  channelReference: string | null;
  channel: string;
  status: string;
  paymentStatus: string;
  amountPaidCents: number;
  pendingBalanceCents: number;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  lineCount: number;
  settledAt: string | null;
  /** Derived: true when paymentStatus is 'pending' or 'partial'. */
  canSettleBalance: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaleListPage<T = SaleListRow> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Repository Port ──────────────────────────────────────────

export interface SaleListReadRepository {
  /**
   * Query sales with pagination, search, filters, and SQL-level sorting.
   *
   * The implementation MUST LEFT JOIN `customers` to resolve `customerName`.
   * Financial sorts (revenue/cost/profit) MUST happen at the DB level via
   * computed expressions (subquery or CTE for line totals).
   *
   * Returns an empty page when no sales match the query.
   */
  query(query: SaleListQuery): Promise<SaleListPage>;
}
