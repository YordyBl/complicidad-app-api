/**
 * Read-only repository port for financial report queries.
 *
 * This port provides cross-module read access for reports without
 * coupling the accounting-reports module to other modules' repositories.
 * Implementations use TypeORM query builders or raw SQL to aggregate
 * data from multiple tables.
 *
 * Defined in the domain layer so application use cases depend on an
 * interface, keeping the domain pure.
 */

// ── Report DTOs ───────────────────────────────────────────────

export interface StockByProductItem {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  totalRemainingQty: number;
  investmentCents: number;
}

export interface LotReportItem {
  lotId: string;
  variantId: string;
  sku: string;
  productName: string;
  purchaseDate: Date;
  purchasedQuantity: number;
  remainingQuantity: number;
  unitCostCents: number;
  totalCostCents: number;
  status: 'OPEN' | 'EXHAUSTED';
}

// ── Port ──────────────────────────────────────────────────────

export interface ReportReadRepository {
  /** Current cash ledger balance in integer cents. Sum of all entry amounts. */
  getLiquidityCents(): Promise<number>;

  /**
   * Stock investment = sum of remaining FIFO lot quantity × unit cost
   * for all lots with remainingQuantity > 0, in integer cents.
   */
  getStockInvestmentCents(): Promise<number>;

  /**
   * Total sales income from ACTIVE non-cancelled, non-returned sales
   * in integer cents. Calculated as sum of sale line total prices
   * for sales where status = 'ACTIVE'.
   */
  getSalesIncomeCents(): Promise<number>;

  /**
   * FIFO COGS = sum of all lot consumption record subtotals from
   * ACTIVE sales in integer cents.
   */
  getFifoCostsCents(): Promise<number>;

  /**
   * Reinvestment = sum of PURCHASE_OUTFLOW cash entry amounts
   * in integer cents. These are cash outflows for stock purchases/restocks.
   */
  getReinvestmentCents(): Promise<number>;

  /**
   * Stock grouped by product and variant with remaining quantities
   * and investment values.
   */
  getStockByProduct(): Promise<StockByProductItem[]>;

  /**
   * All inventory lots with their current status (OPEN / EXHAUSTED)
   * and remaining quantities.
   */
  getLots(): Promise<LotReportItem[]>;
}
