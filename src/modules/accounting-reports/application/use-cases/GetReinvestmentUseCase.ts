/**
 * Application use case: Get Reinvestment.
 *
 * Returns the total cash used for purchases and restocks.
 * In v1, reinvestment equals the sum of PURCHASE_OUTFLOW cash entries.
 * These are cash outflows for stock acquisition.
 */
import type { ReportReadRepository } from '../../domain/ReportReadRepository.js';

export interface ReinvestmentResult {
  reinvestmentCents: number;
  currency: string;
}

export class GetReinvestmentUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<ReinvestmentResult> {
    const reinvestmentCents = await this.reportRepo.getReinvestmentCents();

    return {
      reinvestmentCents,
      currency: 'ARS',
    };
  }
}
