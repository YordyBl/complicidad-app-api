/**
 * Application use case: Get Stock Investment.
 *
 * Returns the total value of remaining stock based on FIFO valuation.
 * Calculated as sum(remainingQuantity × unitCost) for all inventory lots
 * with remaining stock.
 *
 * This represents the immobilised capital tied up in inventory.
 */
import type { ReportReadRepository } from '../../domain/ReportReadRepository.js';

export interface StockInvestmentResult {
  stockInvestmentCents: number;
  currency: string;
}

export class GetStockInvestmentUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<StockInvestmentResult> {
    const stockInvestmentCents = await this.reportRepo.getStockInvestmentCents();

    return {
      stockInvestmentCents,
      currency: 'ARS',
    };
  }
}
