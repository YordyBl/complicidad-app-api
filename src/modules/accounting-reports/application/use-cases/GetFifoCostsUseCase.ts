/**
 * Application use case: Get FIFO COGS.
 *
 * Returns the exact FIFO cost of goods sold for all active sales.
 * This is the sum of lot consumption record subtotals for ACTIVE sales,
 * reflecting the actual cost of inventory consumed.
 */
import type { ReportReadRepository } from '../../domain/ReportReadRepository.js';

export interface FifoCostsResult {
  fifoCostsCents: number;
  currency: string;
}

export class GetFifoCostsUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<FifoCostsResult> {
    const fifoCostsCents = await this.reportRepo.getFifoCostsCents();

    return {
      fifoCostsCents,
      currency: 'ARS',
    };
  }
}
