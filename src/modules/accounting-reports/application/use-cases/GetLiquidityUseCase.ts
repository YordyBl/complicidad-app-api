/**
 * Application use case: Get Current Liquidity.
 *
 * Returns the current cash ledger balance. Liquidity is derived solely
 * from registered cash movements (sales income, purchase outflows,
 * return outflows, manual adjustments, withdrawals).
 *
 * In v1, liquidity does NOT include stock value.
 */
import type { ReportReadRepository } from '../../domain/ReportReadRepository.js';

export interface LiquidityResult {
  liquidityCents: number;
  currency: string;
}

export class GetLiquidityUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<LiquidityResult> {
    const liquidityCents = await this.reportRepo.getLiquidityCents();

    return {
      liquidityCents,
      currency: 'ARS',
    };
  }
}
