/**
 * Application use case: Get Stock by Product/Variant.
 *
 * Returns current stock levels grouped by product and variant,
 * including remaining quantities and investment (FIFO valuation).
 */
import type { ReportReadRepository, StockByProductItem } from '../../domain/ReportReadRepository.js';

export interface StockByProductResult {
  items: StockByProductItem[];
  totalInvestmentCents: number;
  currency: string;
}

export class GetStockByProductUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<StockByProductResult> {
    const items = await this.reportRepo.getStockByProduct();
    const totalInvestmentCents = items.reduce((sum, i) => sum + i.investmentCents, 0);

    return {
      items,
      totalInvestmentCents,
      currency: 'ARS',
    };
  }
}
