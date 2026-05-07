/**
 * List Sales use case — retrieves sales with optional filters.
 *
 * Returns lightweight SaleSummary DTOs. Follows ListCustomersUseCase pattern:
 * plain array return (no Result wrapper), empty list = valid response.
 */
import type { SaleRepository, SaleFilters } from '../../domain/SaleRepository.js';
import type { Sale } from '../../domain/Sale.js';

// ── DTOs ─────────────────────────────────────────────────────

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

// ── Use Case ─────────────────────────────────────────────────

export class ListSalesUseCase {
  constructor(private readonly saleRepository: SaleRepository) {}

  async execute(filters?: SaleFilters): Promise<SaleSummary[]> {
    // Validate date filters — silently ignore invalid dates
    const validFilters = this.validateFilters(filters);

    const sales = await this.saleRepository.findAll(validFilters);

    return sales.map((sale) => this.toSummary(sale));
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
