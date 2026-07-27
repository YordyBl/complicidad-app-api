/**
 * Application use case: Get Lots (paginated).
 *
 * Returns all FIFO inventory lots with their current status
 * (OPEN or EXHAUSTED) and remaining quantities, filtered
 * by search and paginated.
 */
import type {
  ReportReadRepository,
  ReportListQuery,
  LotReportItem,
  PaginatedResponse,
} from '../../domain/ReportReadRepository.js';

export type LotsResult = PaginatedResponse<LotReportItem>;

export class GetLotsUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(query: ReportListQuery): Promise<LotsResult> {
    return this.reportRepo.getLots(query);
  }
}
