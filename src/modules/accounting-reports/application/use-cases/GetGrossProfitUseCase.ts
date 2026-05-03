/**
 * Application use case: Get Gross / Estimated Profit.
 *
 * Gross profit = sales income − FIFO COGS.
 *
 * This is an ESTIMATED profit because v1 does not model operational
 * expenses (rent, salaries, utilities, etc.). It represents the gross
 * margin from sales after inventory costs.
 *
 * v1 accounting model: simple cash accounting + FIFO inventory valuation.
 */
import type { ReportReadRepository } from '../../domain/ReportReadRepository.js';

export interface GrossProfitResult {
  salesIncomeCents: number;
  fifoCostsCents: number;
  grossProfitCents: number;
  currency: string;
}

export class GetGrossProfitUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<GrossProfitResult> {
    const salesIncomeCents = await this.reportRepo.getSalesIncomeCents();
    const fifoCostsCents = await this.reportRepo.getFifoCostsCents();

    return {
      salesIncomeCents,
      fifoCostsCents,
      grossProfitCents: salesIncomeCents - fifoCostsCents,
      currency: 'ARS',
    };
  }
}
