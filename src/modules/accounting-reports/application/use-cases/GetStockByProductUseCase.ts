/**
 * Application use case: Get Stock by Product/Variant (paginated).
 *
 * Returns current stock levels grouped by product and variant,
 * including remaining quantities and investment (FIFO valuation),
 * filtered by search and paginated.
 */
import type {
  ReportReadRepository,
  ReportListQuery,
  StockByProductItem,
  PaginatedResponse,
} from '../../domain/ReportReadRepository.js';

export type StockByProductResult = PaginatedResponse<StockByProductItem>;

export class GetStockByProductUseCase {
  constructor(private readonly reportRepo: ReportReadRepository) {}

  async execute(query: ReportListQuery): Promise<StockByProductResult> {
    return this.reportRepo.getStockByProduct(query);
  }
}
