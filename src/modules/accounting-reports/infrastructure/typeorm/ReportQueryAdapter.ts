/**
 * TypeORM-backed read-only report query adapter.
 *
 * Implements the ReportReadRepository port by querying across
 * multiple tables using TypeORM's QueryBuilder.
 *
 * This lives in infrastructure because it directly queries the
 * database — no domain entities are constructed.
 */
import { type EntityManager } from 'typeorm';
import type {
  ReportReadRepository,
  StockByProductItem,
  LotReportItem,
  ReportListQuery,
  PaginatedResponse,
} from '../../domain/ReportReadRepository.js';

/**
 * Normalize a raw DB aggregate value to integer cents.
 *
 * PostgreSQL aggregate queries can return number, string, or null
 * depending on the driver and query shape. This helper ensures
 * the return value is always a safe integer cent, treating null
 * and undefined as zero.
 *
 * Accepts `unknown` because TypeORM's getRawMany/getRawOne return
 * Record<string, unknown>, and this function is the normalization
 * boundary where any DB value type must be coerced.
 *
 * Negative values are preserved — only the type/scale is coerced.
 * This MUST be the only normalization point for monetary aggregates
 * at the infrastructure boundary.
 */
export function normalizeCents(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Math.round(value);
  if (typeof value === 'string') return Math.round(Number(value));
  // Unexpected types (bool, object, etc.) — should never reach here
  // from DB aggregate queries, but boundary must handle gracefully.
  return 0;
}

/**
 * Normalize raw HTTP query params into a safe ReportListQuery.
 *
 * Applies defaults (page=1, pageSize=5, search=''), clamps bounds,
 * and trims whitespace. Accepts a Record<string, unknown> to handle
 * Express req.query directly.
 */
export function normalizeReportListQuery(
  raw: Record<string, unknown> | undefined,
): ReportListQuery {
  const parsed: ReportListQuery = {
    page: 1,
    pageSize: 5,
    search: '',
  };

  if (!raw) return parsed;

  // Parse page
  if (raw.page !== undefined) {
    const p =
      typeof raw.page === 'number' ? raw.page : Number(raw.page);
    if (Number.isFinite(p) && p >= 1) {
      parsed.page = Math.floor(p);
    }
  }

  // Parse pageSize
  if (raw.pageSize !== undefined) {
    const ps =
      typeof raw.pageSize === 'number' ? raw.pageSize : Number(raw.pageSize);
    if (Number.isFinite(ps)) {
      parsed.pageSize = Math.max(1, Math.min(100, Math.floor(ps)));
    }
  }

  // Parse search
  if (typeof raw.search === 'string') {
    parsed.search = raw.search.trim();
  }

  return parsed;
}

export class ReportQueryAdapter implements ReportReadRepository {
  constructor(private readonly manager: EntityManager) {}

  async getLiquidityCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(amount_cents), 0)', 'total')
      .from('cash_ledger_entries', 'e')
      .getRawOne<{ total: number | null }>();

    return normalizeCents(result?.total);
  }

  async getStockInvestmentCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(remaining_quantity * unit_cost_cents), 0)', 'total')
      .from('inventory_lots', 'l')
      .where('l.remaining_quantity > 0')
      .getRawOne<{ total: number | null }>();

    return normalizeCents(result?.total);
  }

  async getSalesIncomeCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(sl.quantity * sl.unit_price_cents), 0)', 'total')
      .from('sale_lines', 'sl')
      .innerJoin('sales', 's', 's.id = sl.sale_id')
      .where("s.status = 'ACTIVE'")
      .getRawOne<{ total: number | null }>();

    return normalizeCents(result?.total);
  }

  async getFifoCostsCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(lcr.subtotal_cents), 0)', 'total')
      .from('lot_consumption_records', 'lcr')
      .innerJoin('sale_lines', 'sl', 'sl.id = lcr.sale_line_id')
      .innerJoin('sales', 's', 's.id = sl.sale_id')
      .where("s.status = 'ACTIVE'")
      .getRawOne<{ total: number | null }>();

    return normalizeCents(result?.total);
  }

  async getReinvestmentCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(e.amount_cents), 0)', 'total')
      .from('cash_ledger_entries', 'e')
      .where("e.type = 'PURCHASE_OUTFLOW'")
      .getRawOne<{ total: number | null }>();

    // amount_cents is negative for outflows; return the absolute value
    return Math.abs(normalizeCents(result?.total));
  }

  async getStockByProduct(
    query: ReportListQuery,
  ): Promise<PaginatedResponse<StockByProductItem>> {
    const { page, pageSize, search } = query;
    const offset = (page - 1) * pageSize;

    // ── Shared query builder for stock-by-product ────────────
    const buildBase = () => {
      let qb = this.manager
        .createQueryBuilder()
        .select([
          'p.id AS product_id',
          'p.name AS product_name',
          'v.id AS variant_id',
          'v.sku AS variant_name',
          'v.sku AS sku',
          'COALESCE(SUM(l.remaining_quantity), 0) AS total_remaining_qty',
          'COALESCE(SUM(l.remaining_quantity * l.unit_cost_cents), 0) AS investment_cents',
        ])
        .from('inventory_lots', 'l')
        .innerJoin('variants', 'v', 'v.id = l.variant_id')
        .innerJoin('products', 'p', 'p.id = v.product_id')
        .where('l.remaining_quantity > 0');

      if (search) {
        qb = qb.andWhere(
          '(p.name ILIKE :search OR v.sku ILIKE :search)',
          { search: `%${search}%` },
        );
      }

      return qb
        .groupBy('p.id')
        .addGroupBy('p.name')
        .addGroupBy('v.id')
        .addGroupBy('v.sku')
        .orderBy('p.name', 'ASC')
        .addOrderBy('v.sku', 'ASC');
    };

    // ── Count ────────────────────────────────────────────────
    const countResult = await buildBase()
      .select('COUNT(DISTINCT l.variant_id)', 'total')
      .getRawOne<{ total: number | null }>();

    const totalItems = normalizeCents(countResult?.total);

    // ── Data ─────────────────────────────────────────────────
    const rows = await buildBase().offset(offset).limit(pageSize).getRawMany();

    const items = rows.map((r: Record<string, unknown>) => ({
      productId: r.product_id as string,
      productName: r.product_name as string,
      variantId: r.variant_id as string,
      variantName: r.variant_name as string,
      sku: r.sku as string,
      totalRemainingQty: Number(r.total_remaining_qty),
      investmentCents: normalizeCents(r.investment_cents),
    }));

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0,
      search,
    };
  }

  async getLots(
    query: ReportListQuery,
  ): Promise<PaginatedResponse<LotReportItem>> {
    const { page, pageSize, search } = query;
    const offset = (page - 1) * pageSize;

    // ── Count query (no ORDER BY — not applicable to aggregation) ──
    let countQb = this.manager
      .createQueryBuilder()
      .select('COUNT(l.id)', 'total')
      .from('inventory_lots', 'l')
      .innerJoin('variants', 'v', 'v.id = l.variant_id')
      .innerJoin('products', 'p', 'p.id = v.product_id');

    if (search) {
      countQb = countQb.andWhere(
        '(p.name ILIKE :search OR v.sku ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const countResult = await countQb.getRawOne<{ total: number | null }>();
    const totalItems = normalizeCents(countResult?.total);

    // ── Data query ─────────────────────────────────────────────
    let dataQb = this.manager
      .createQueryBuilder()
      .select([
        'l.id AS lot_id',
        'l.variant_id AS variant_id',
        'v.sku AS sku',
        'p.name AS product_name',
        'l.purchase_date AS purchase_date',
        'l.purchased_quantity AS purchased_quantity',
        'l.remaining_quantity AS remaining_quantity',
        'l.unit_cost_cents AS unit_cost_cents',
      ])
      .from('inventory_lots', 'l')
      .innerJoin('variants', 'v', 'v.id = l.variant_id')
      .innerJoin('products', 'p', 'p.id = v.product_id')
      .orderBy('l.purchase_date', 'ASC')
      .addOrderBy('l.created_at', 'ASC');

    if (search) {
      dataQb = dataQb.andWhere(
        '(p.name ILIKE :search OR v.sku ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await dataQb.offset(offset).limit(pageSize).getRawMany();

    const items = rows.map((r: Record<string, unknown>) => {
      const remainingQty = Number(r.remaining_quantity);
      const unitCostCents = normalizeCents(r.unit_cost_cents);
      const item: LotReportItem = {
        lotId: r.lot_id as string,
        variantId: r.variant_id as string,
        sku: r.sku as string,
        productName: r.product_name as string,
        purchaseDate: r.purchase_date as Date,
        purchasedQuantity: Number(r.purchased_quantity),
        remainingQuantity: remainingQty,
        unitCostCents,
        totalCostCents: remainingQty * unitCostCents,
        status: remainingQty > 0 ? 'OPEN' : 'EXHAUSTED',
      };
      return item;
    });

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0,
      search,
    };
  }
}
