/**
 * TypeORM-backed implementation of SaleListReadRepository.
 *
 * Performs paginated sale listing with:
 * - Customer name resolution (LEFT JOIN customers)
 * - Search by customer name (ILIKE substring)
 * - Date range filtering
 * - Status and paymentStatus filtering
 * - Sorting by createdAt, totalRevenue, totalCost, or grossProfit
 * - Pagination (page/pageSize with total count)
 *
 * Financial totals (revenue/cost/profit) are computed via subqueries
 * from sale_lines and lot_consumption_records since these values are
 * derived at the aggregate level, not stored as columns on `sales`.
 *
 * Uses QueryBuilder instead of raw manager.query() to avoid the
 * "Query values must be an array" runtime error that occurs when
 * passing named-parameter objects to the PostgreSQL driver.
 */
import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import type {
  SaleListReadRepository,
  SaleListQuery,
  SaleListPage,
  SaleListRow,
} from '../../application/ports/SaleListReadRepository.js';

interface SaleSummaryRow {
  sale_id: string;
  customer_id: string;
  customer_name: string;
  channel_reference: string | null;
  channel: string;
  status: string;
  payment_status: string;
  amount_paid_cents: number;
  pending_balance_cents: number;
  settled_at: Date | null;
  created_at: Date;
  updated_at: Date;
  total_revenue_cents: string;
  total_cost_cents: string;
  gross_profit_cents: string;
  line_count: string;
}

/**
 * Sortable columns mapped to SQL expressions.
 * Financial columns use subqueries because totals are derived,
 * not stored directly on `sales`.
 */
const SORT_COLUMNS: Record<string, string> = {
  createdAt: 's.created_at',
  totalRevenueCents: 'total_revenue_cents',
  totalCostCents: 'total_cost_cents',
  grossProfitCents: 'gross_profit_cents',
};

/**
 * SQL expression for total revenue per sale:
 * SUM of (quantity * unit_price_cents) across all sale_lines for the sale.
 */
const REVENUE_EXPR = `
  COALESCE(
    (SELECT SUM(sl.quantity * sl.unit_price_cents)
     FROM sale_lines sl
     WHERE sl.sale_id = s.id),
    0
  )
`;

/**
 * SQL expression for total cost per sale:
 * SUM of subtotal_cents across all lot_consumption_records
 * that belong to sale_lines that belong to the sale.
 */
const COST_EXPR = `
  COALESCE(
    (SELECT SUM(lcr.subtotal_cents)
     FROM lot_consumption_records lcr
     JOIN sale_lines sl2 ON sl2.id = lcr.sale_line_id
     WHERE sl2.sale_id = s.id),
    0
  )
`;

/**
 * SQL expression for line count per sale.
 */
const LINE_COUNT_EXPR = `
  (SELECT COUNT(*) FROM sale_lines sl3 WHERE sl3.sale_id = s.id)::int
`;

/**
 * Compact SELECT expressions for QueryBuilder.
 * Each string is a raw SQL expression with an AS alias.
 */
const SELECT_EXPRESSIONS: string[] = [
  's.id AS sale_id',
  's.customer_id AS customer_id',
  "COALESCE(c.name, 'Cliente desconocido') AS customer_name",
  's.channel_reference AS channel_reference',
  's.channel AS channel',
  's.status AS status',
  's.payment_status AS payment_status',
  's.amount_paid_cents AS amount_paid_cents',
  's.pending_balance_cents AS pending_balance_cents',
  's.settled_at AS settled_at',
  's.created_at AS created_at',
  's.updated_at AS updated_at',
  `(${REVENUE_EXPR.trim()}) AS total_revenue_cents`,
  `(${COST_EXPR.trim()}) AS total_cost_cents`,
  `((${REVENUE_EXPR.trim()}) - (${COST_EXPR.trim()})) AS gross_profit_cents`,
  `${LINE_COUNT_EXPR.trim()} AS line_count`,
];

export class TypeOrmSaleListReadRepository implements SaleListReadRepository {
  constructor(private readonly manager: EntityManager) {}

  async query(q: SaleListQuery = {}): Promise<SaleListPage> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const sortKey = q.sortBy ?? 'createdAt';
    const sortCol = SORT_COLUMNS[sortKey] ?? 's.created_at';
    const sortOrder = q.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // ── Count query ──────────────────────────────────────────
    const countQb = this.createBaseQuery();
    this.applyWhere(countQb, q);

    const countResult = await countQb
      .select('COUNT(*)::int', 'total')
      .getRawOne<{ total: number }>();
    const total = countResult?.total ?? 0;

    // ── Data query ───────────────────────────────────────────
    const dataQb = this.createBaseQuery();
    this.applyWhere(dataQb, q);

    dataQb
      .select(SELECT_EXPRESSIONS)
      .orderBy(sortCol, sortOrder)
      .offset(offset)
      .limit(pageSize);

    const rawRows = await dataQb.getRawMany();
    const rows = rawRows as SaleSummaryRow[];

    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

    return {
      items: rows.map((row) => this.toItem(row)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Creates a base QueryBuilder with the FROM and LEFT JOIN clauses
   * that are shared between the count and data queries.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createBaseQuery(): SelectQueryBuilder<any> {
    return this.manager
      .createQueryBuilder()
      .from('sales', 's')
      .leftJoin('customers', 'c', 'c.id = s.customer_id');
  }

  /**
   * Applies optional WHERE conditions from the SaleListQuery to the
   * given QueryBuilder. Mutates the builder in place (chained API).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyWhere(
    qb: SelectQueryBuilder<any>,
    q: SaleListQuery,
  ): void {
    if (q.search) {
      qb.andWhere('c.name ILIKE :search', { search: `%${q.search}%` });
    }
    if (q.status) {
      qb.andWhere('s.status = :status', { status: q.status });
    }
    if (q.paymentStatus) {
      qb.andWhere('s.payment_status = :paymentStatus', { paymentStatus: q.paymentStatus });
    }
    if (q.dateFrom) {
      const from = new Date(q.dateFrom);
      if (!isNaN(from.getTime())) {
        qb.andWhere('s.created_at >= :dateFrom', { dateFrom: from });
      }
    }
    if (q.dateTo) {
      const toRaw = new Date(q.dateTo);
      if (!isNaN(toRaw.getTime())) {
        const to = new Date(
          toRaw.getFullYear(),
          toRaw.getMonth(),
          toRaw.getDate(),
          23, 59, 59, 999,
        );
        qb.andWhere('s.created_at <= :dateTo', { dateTo: to });
      }
    }
  }

  private toItem(row: SaleSummaryRow): SaleListRow {
    const paymentStatus = row.payment_status;
    return {
      saleId: row.sale_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      channelReference: row.channel_reference,
      channel: row.channel,
      status: row.status,
      paymentStatus,
      amountPaidCents: row.amount_paid_cents,
      pendingBalanceCents: row.pending_balance_cents,
      totalRevenueCents: parseInt(row.total_revenue_cents, 10),
      totalCostCents: parseInt(row.total_cost_cents, 10),
      grossProfitCents: parseInt(row.gross_profit_cents, 10),
      lineCount: parseInt(row.line_count, 10),
      settledAt: row.settled_at ? row.settled_at.toISOString() : null,
      canSettleBalance: paymentStatus === 'pending' || paymentStatus === 'partial',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
