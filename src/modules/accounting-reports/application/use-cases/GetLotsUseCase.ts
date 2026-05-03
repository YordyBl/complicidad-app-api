/**
 * Application use case: Get Open / Exhausted Lots.
 *
 * Returns all FIFO inventory lots with their current status
 * (OPEN or EXHAUSTED) and remaining quantities.
 */
import type { ReportReadRepository, LotReportItem } from '../../domain/ReportReadRepository.js';

export interface LotsResult {
  open: LotReportItem[];
  exhausted: LotReportItem[];
  totalOpenCount: number;
  totalExhaustedCount: number;
}

export class GetLotsUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(): Promise<LotsResult> {
    const allLots = await this.reportRepo.getLots();
    const open = allLots.filter((l) => l.status === 'OPEN');
    const exhausted = allLots.filter((l) => l.status === 'EXHAUSTED');

    return {
      open,
      exhausted,
      totalOpenCount: open.length,
      totalExhaustedCount: exhausted.length,
    };
  }
}
