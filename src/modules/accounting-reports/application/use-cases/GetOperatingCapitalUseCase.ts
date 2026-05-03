/**
 * Application use case: Get Estimated Operating Capital.
 *
 * Estimated operating capital = liquidity + stock investment.
 *
 * This represents the total capital deployed in the business:
 * - Cash available (liquidity)
 * - Value of remaining inventory (stock investment)
 *
 * Operational expenses are excluded in v1.
 */
import type { ReportReadRepository } from '../../domain/ReportReadRepository.js';

export interface OperatingCapitalResult {
  liquidityCents: number;
  stockInvestmentCents: number;
  operatingCapitalCents: number;
  currency: string;
}

export class GetOperatingCapitalUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<OperatingCapitalResult> {
    const liquidityCents = await this.reportRepo.getLiquidityCents();
    const stockInvestmentCents = await this.reportRepo.getStockInvestmentCents();

    return {
      liquidityCents,
      stockInvestmentCents,
      operatingCapitalCents: liquidityCents + stockInvestmentCents,
      currency: 'ARS',
    };
  }
}
