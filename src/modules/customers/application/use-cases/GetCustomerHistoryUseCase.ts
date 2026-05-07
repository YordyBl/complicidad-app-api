/**
 * Get Customer History use case — derives purchase history from Sales data.
 *
 * CRITICAL DESIGN: History is NOT stored on the Customer entity. It is
 * derived from Sale/SaleLine/LotConsumptionRecord data by querying
 * the SaleRepository.
 *
 * This ensures:
 * - History always reflects the actual sales data (cannot get out of sync)
 * - Cancelled and returned sales are accurately reported
 * - No manual editing of history on the Customer entity
 *
 * Totals reporting:
 * - totalRevenueCents, totalCostCents, grossProfitCents: Only from ACTIVE sales
 * - Cancelled and returned sales are listed but excluded from active totals
 * - Counts reflect all sales regardless of status
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import { Money } from '../../../../shared/domain/Money.js';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { UnitOfWorkScope } from '../../../../shared/application/UnitOfWork.js';
import type { SaleRepository } from '../../../sales-returns/domain/SaleRepository.js';
import type { CustomerRepository } from '../../domain/CustomerRepository.js';
import { CustomerId } from '../../domain/CustomerId.js';

// ── Module-specific scope ────────────────────────────────────

export interface CustomerHistoryScope extends UnitOfWorkScope {
  sales: SaleRepository;
}

// ── DTOs ─────────────────────────────────────────────────────

export interface GetCustomerHistoryCommand {
  customerId: string;
}

export interface CustomerSaleSummary {
  saleId: string;
  channelReference: string | null;
  channel: string;
  status: 'ACTIVE' | 'CANCELLED' | 'RETURNED';
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  lineCount: number;
  createdAt: string;
}

export interface CustomerHistorySummary {
  totalSales: number;
  activeCount: number;
  cancelledCount: number;
  returnedCount: number;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
}

export interface CustomerHistoryResponse  {
  customerId: string;
  customerName: string;
  sales: CustomerSaleSummary[] | [];
  summary: CustomerHistorySummary;
} 

// ── Use Case ─────────────────────────────────────────────────

export class GetCustomerHistoryUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
  ) {}

  /**
   * Execute the history query within a UnitOfWork.
   * The UnitOfWorkScope must conform to CustomerHistoryScope, providing:
   * - scope.sales (SaleRepository with findByCustomerId)
   */
  async execute(
    command: GetCustomerHistoryCommand,
    uow: UnitOfWork,
  ): Promise<Result<CustomerHistoryResponse>> {
    // ── Validate customer exists ─────────────────────────────
    const customerId = CustomerId.from(command.customerId);
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) {
      return err(new NotFoundError('Customer', command.customerId));
    }

    return uow.run(async (baseScope) => {
      const scope = baseScope as CustomerHistoryScope;

      // ── Load all sales for this customer ───────────────────
      const sales = await scope.sales.findByCustomerId(command.customerId);
      if(sales.length === 0) {
        return ok({
            customerId: customer.id.toString(),
        customerName: customer.name,
        sales: [],
        summary: {
          totalSales: 0,
          activeCount: 0,
          cancelledCount: 0,
          returnedCount: 0,
          totalRevenueCents: 0,
          totalCostCents: 0,
          grossProfitCents: 0,
        }
      });}
      // ── Derive sale summaries ──────────────────────────────
      const saleSummaries: CustomerSaleSummary[] = sales.map((sale) => ({
        saleId: sale.id.toString(),
        channelReference: sale.channelReference ?? null,
        channel: sale.channel,
        status: sale.status,
        totalRevenueCents: sale.totalRevenue.cents,
        totalCostCents: sale.totalCost.cents,
        grossProfitCents: sale.grossProfit.cents,
        lineCount: sale.lines.length,
        createdAt: sale.createdAt.toISOString(),
      }));

      // ── Compute summary ────────────────────────────────────
      let activeRevenue = Money.ZERO;
      let activeCost = Money.ZERO;
      let activeCount = 0;
      let cancelledCount = 0;
      let returnedCount = 0;

      for (const sale of sales) {
        if (sale.status === 'ACTIVE') {
          activeRevenue = activeRevenue.add(sale.totalRevenue);
          activeCost = activeCost.add(sale.totalCost);
          activeCount++;
        } else if (sale.status === 'CANCELLED') {
          cancelledCount++;
        } else {
          returnedCount++;
        }
      }

      return ok({
        customerId: customer.id.toString(),
        customerName: customer.name,
        sales: saleSummaries,
        summary: {
          totalSales: sales.length,
          activeCount,
          cancelledCount,
          returnedCount,
          totalRevenueCents: activeRevenue.cents,
          totalCostCents: activeCost.cents,
          grossProfitCents: activeRevenue.subtract(activeCost).cents,
        },
      });
    });
  }
}
