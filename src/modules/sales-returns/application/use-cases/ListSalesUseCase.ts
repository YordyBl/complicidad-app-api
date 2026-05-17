/**
 * List Sales use case — retrieves sales with optional filters.
 *
 * Returns SaleWithItems DTOs that extend SaleSummary with sold-garment
 * display rows for inline APP rendering. Follows ListCustomersUseCase
 * pattern: plain array return (no Result wrapper), empty list = valid response.
 *
 * Batch-loads item detail rows via SaleListItemReadRepository to avoid
 * N+1 queries and groups them by saleId so the response never duplicates
 * sale rows.
 */
import type { SaleRepository, SaleFilters } from '../../domain/SaleRepository.js';
import type { Sale } from '../../domain/Sale.js';
import type {
  SaleListItemReadRepository,
  SaleListItem,
} from '../ports/SaleListItemReadRepository.js';

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
  ) {}

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
