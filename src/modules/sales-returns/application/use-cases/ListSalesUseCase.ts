/**
 * List Sales use case — retrieves sales with optional filters.
 *
 * Two listing paths:
 * 1. Legacy: `execute(filters?)` uses SaleRepository aggregate loading
 *    and returns a plain array. Kept for backward compatibility.
 * 2. Paginated: `executePaginated(query)` uses SaleListReadRepository
 *    for SQL-level search, sort, pagination, and customer-name resolution.
 *    Returns a SaleListPage with metadata.
 *
 * Both paths batch-load item display rows via SaleListItemReadRepository
 * and group them by saleId so the response never duplicates sale rows.
 */
import type { SaleRepository, SaleFilters } from '../../domain/SaleRepository.js';
import type { Sale } from '../../domain/Sale.js';
import type {
  SaleListItemReadRepository,
  SaleListItem,
} from '../ports/SaleListItemReadRepository.js';
import type {
  SaleListReadRepository,
  SaleListQuery,
  SaleListPage,
} from '../ports/SaleListReadRepository.js';

// ── DTOs ─────────────────────────────────────────────────────

/** Legacy summary — kept for backward compatibility with existing callers. */
export interface SaleSummary {
  saleId: string;
  customerId: string;
  channelReference: string | null;
  channel: string;
  status: string;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

/** PR2 extension: SaleSummary with batched sold-garment display rows. */
export interface SaleWithItems extends SaleSummary {
  /** Sold garment details for inline display. Always an array (empty when no items). */
  items: SaleListItem[];
}

// ── Use Case ─────────────────────────────────────────────────

export class ListSalesUseCase {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly itemReadRepository?: SaleListItemReadRepository,
    private readonly saleListReadRepository?: SaleListReadRepository,
  ) {}

  // ── Legacy path ─────────────────────────────────────────

  async execute(filters?: SaleFilters): Promise<SaleWithItems[]> {
    // Validate date filters — silently ignore invalid dates
    const validFilters = this.validateFilters(filters);

    const sales = await this.saleRepository.findAll(validFilters);

    if (sales.length === 0 || !this.itemReadRepository) {
      return sales.map((sale) => ({ ...this.toSummary(sale), items: [] }));
    }

    // Batch-load item display rows for all matching sales
    const saleIds = sales.map((s) => s.id.toString());
    const allItems = await this.itemReadRepository.findBySaleIds(saleIds);

    // Group items by saleId so each sale appears exactly once
    const itemsBySale = new Map<string, SaleListItem[]>();
    for (const item of allItems) {
      const group = itemsBySale.get(item.saleId);
      if (group) {
        group.push(item);
      } else {
        itemsBySale.set(item.saleId, [item]);
      }
    }

    return sales.map((sale) => ({
      ...this.toSummary(sale),
      items: itemsBySale.get(sale.id.toString()) ?? [],
    }));
  }

  // ── Paginated path (read-model backed) ──────────────────

  /**
   * Execute a paginated, sorted, and filterable sale listing
   * backed by the SaleListReadRepository.
   *
   * Falls back to the legacy aggregate path when no
   * SaleListReadRepository is wired.
   */
  async executePaginated(query: SaleListQuery = {}): Promise<SaleListPage<SaleWithItems>> {
    if (!this.saleListReadRepository) {
      // Backward compat: no read repo wired → use legacy aggregate path
      // and wrap result in a single-page response.
      const legacyFilters: SaleFilters = {};
      if (query.sortOrder) legacyFilters.sortOrder = query.sortOrder;
      if (query.status) legacyFilters.status = query.status;
      if (query.dateFrom) legacyFilters.dateFrom = query.dateFrom;
      if (query.dateTo) legacyFilters.dateTo = query.dateTo;
      const items = await this.execute(
        Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
      );
      return {
        items,
        total: items.length,
        page: 1,
        pageSize: items.length,
        totalPages: 1,
      };
    }

    const page = await this.saleListReadRepository.query(query);

    // Batch-load item display rows for the returned page only
    const itemsBySale = new Map<string, SaleListItem[]>();
    if (this.itemReadRepository && page.items.length > 0) {
      const saleIds = page.items.map((row) => row.saleId);
      const allItems = await this.itemReadRepository.findBySaleIds(saleIds);
      for (const item of allItems) {
        const group = itemsBySale.get(item.saleId);
        if (group) {
          group.push(item);
        } else {
          itemsBySale.set(item.saleId, [item]);
        }
      }
    }

    return {
      items: page.items.map((row) => ({
        saleId: row.saleId,
        customerId: row.customerId,
        customerName: row.customerName,
        channelReference: row.channelReference,
        channel: row.channel,
        status: row.status,
        paymentStatus: row.paymentStatus,
        amountPaidCents: row.amountPaidCents,
        pendingBalanceCents: row.pendingBalanceCents,
        totalRevenueCents: row.totalRevenueCents,
        totalCostCents: row.totalCostCents,
        grossProfitCents: row.grossProfitCents,
        lineCount: row.lineCount,
        settledAt: row.settledAt,
        canSettleBalance: row.canSettleBalance,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        items: itemsBySale.get(row.saleId) ?? [],
      })),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
    };
  }

  private validateFilters(filters?: SaleFilters): SaleFilters | undefined {
    if (!filters) return undefined;

    const validated: SaleFilters = {};

    if (filters.customerId) {
      validated.customerId = filters.customerId;
    }
    if (filters.status) {
      validated.status = filters.status;
    }
    if (filters.sortOrder) {
      validated.sortOrder = filters.sortOrder;
    }

    // Validate dateFrom
    if (filters.dateFrom) {
      const d = new Date(filters.dateFrom);
      if (!isNaN(d.getTime())) {
        validated.dateFrom = filters.dateFrom;
      }
      // Invalid date → omitted from filter
    }

    // Validate dateTo
    if (filters.dateTo) {
      const d = new Date(filters.dateTo);
      if (!isNaN(d.getTime())) {
        validated.dateTo = filters.dateTo;
      }
      // Invalid date → omitted from filter
    }

    return Object.keys(validated).length > 0 ? validated : undefined;
  }

  private toSummary(sale: Sale): SaleSummary {
    return {
      saleId: sale.id.toString(),
      customerId: sale.customerId,
      channelReference: sale.channelReference ?? null,
      channel: sale.channel,
      status: sale.status,
      totalRevenueCents: sale.totalRevenue.cents,
      totalCostCents: sale.totalCost.cents,
      grossProfitCents: sale.grossProfit.cents,
      lineCount: sale.lines.length,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
    };
  }
}
