/**
 * Application use case: Get Sales Total (Income).
 *
 * Returns total sales income from active (non-cancelled, non-returned)
 * sales. In v1, cancelled and returned sales are excluded because their
 * cash effects have been reversed.
 */
import type { ReportReadRepository } from '../../domain/ReportReadRepository.js';

export interface SalesTotalResult {
  salesIncomeCents: number;
  currency: string;
  activeSaleCount: number;
}

export class GetSalesTotalUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<SalesTotalResult> {
    const salesIncomeCents = await this.reportRepo.getSalesIncomeCents();

    return {
      salesIncomeCents,
      currency: 'ARS',
      activeSaleCount: 0, // v1 placeholder — can be added when needed
    };
  }
}
