/**
 * Unit tests for TypeOrmSaleListReadRepository QueryBuilder structure.
 *
 * Verifies that the repository uses createQueryBuilder (not raw
 * manager.query() with named parameters which causes the
 * "Query values must be an array" runtime error in PostgreSQL).
 *
 * Uses a mock EntityManager + QueryBuilder chain to validate
 * the query structure without requiring a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import { TypeOrmSaleListReadRepository } from '../../../src/modules/sales-returns/infrastructure/typeorm/TypeOrmSaleListReadRepository.js';

// ── Mock builders ────────────────────────────────────────────────

type MockQbCall = { method: string; args: unknown[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TrackedQb extends SelectQueryBuilder<any> {
  getCalls(): MockQbCall[];
}

/**
 * Creates a mock SelectQueryBuilder that records all method calls
 * and returns `this` for chaining. The calls array is populated
 * during query execution and can be read via getCalls().
 */
function createTrackedQb(
  getRawOneResult: unknown = { total: 0 },
  getRawManyResult: unknown[] = [],
): TrackedQb {
  const calls: MockQbCall[] = [];

  function makeProxy(): Record<string, unknown> {
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === 'getCalls') {
          return () => calls;
        }
        if (prop === 'then') {
          // Prevent Promise resolution from treating the proxy as thenable
          return undefined;
        }

        return (...args: unknown[]) => {
          calls.push({ method: prop, args });

          // Terminal methods — return a promise
          if (prop === 'getRawOne') return Promise.resolve(getRawOneResult);
          if (prop === 'getRawMany') return Promise.resolve(getRawManyResult);
          if (prop === 'getCount') return Promise.resolve(0);

          // Chaining methods — return a fresh proxy for the next link
          // (new proxy shares the same calls array via closure)
          return makeProxy() as unknown as SelectQueryBuilder<any>;
        };
      },
    };

    return new Proxy({}, handler);
  }

  return makeProxy() as unknown as TrackedQb;
}

// ── Tests ────────────────────────────────────────────────────────

describe('TypeOrmSaleListReadRepository', () => {
  let repo: TypeOrmSaleListReadRepository;
  let countQb: TrackedQb;
  let dataQb: TrackedQb;
  let managerQuerySpy: ReturnType<typeof vi.fn>;

  function setupRepo(
    countResult: unknown = { total: 5 },
    rowsResult: unknown[] = [],
  ) {
    countQb = createTrackedQb(countResult, []);
    dataQb = createTrackedQb({}, rowsResult);
    managerQuerySpy = vi.fn();

    const manager = {
      createQueryBuilder: vi.fn()
        .mockReturnValueOnce(countQb)
        .mockReturnValueOnce(dataQb),
      query: managerQuerySpy,
    } as unknown as EntityManager;

    repo = new TypeOrmSaleListReadRepository(manager);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupRepo();
  });

  // ── Core regression: QueryBuilder vs raw query() ───────────

  describe('regression: uses QueryBuilder, not raw query()', () => {
    it('never calls manager.query()', async () => {
      await repo.query({});
      expect(managerQuerySpy).not.toHaveBeenCalled();
    });

    it('calls createQueryBuilder exactly twice (count + data)', async () => {
      // We don't directly access the mock here because setupRepo resets it.
      // Re-create with explicit spy access.
      const qbSpy = vi.fn()
        .mockReturnValueOnce(createTrackedQb({ total: 0 }))
        .mockReturnValueOnce(createTrackedQb({}));

      const mgr = { createQueryBuilder: qbSpy, query: vi.fn() } as unknown as EntityManager;
      const r = new TypeOrmSaleListReadRepository(mgr);
      await r.query({});

      expect(qbSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── Query structure ────────────────────────────────────────

  describe('FROM and JOIN clauses', () => {
    it('uses FROM sales AS s on count query', async () => {
      await repo.query({});
      const countCalls = countQb.getCalls();
      const fromCall = countCalls.find((c) => c.method === 'from');
      expect(fromCall).toBeDefined();
      expect(fromCall!.args).toEqual(['sales', 's']);
    });

    it('uses FROM sales AS s on data query', async () => {
      await repo.query({});
      const dataCalls = dataQb.getCalls();
      const fromCall = dataCalls.find((c) => c.method === 'from');
      expect(fromCall).toBeDefined();
      expect(fromCall!.args).toEqual(['sales', 's']);
    });

    it('LEFT JOINs customers on both queries', async () => {
      await repo.query({});

      for (const qb of [countQb, dataQb]) {
        const joinCall = qb.getCalls().find((c) => c.method === 'leftJoin');
        expect(joinCall).toBeDefined();
        expect(joinCall!.args).toEqual(['customers', 'c', 'c.id = s.customer_id']);
      }
    });
  });

  // ── Filters ────────────────────────────────────────────────

  describe('WHERE clauses', () => {
    it('applies search with ILIKE on both queries', async () => {
      await repo.query({ search: 'Juan' });

      for (const qb of [countQb, dataQb]) {
        const whereCalls = qb.getCalls().filter((c) => c.method === 'andWhere');
        const searchCall = whereCalls.find(
          (c) => typeof c.args[0] === 'string' && (c.args[0] as string).includes('ILIKE'),
        );
        expect(searchCall).toBeDefined();
        expect(searchCall!.args[0]).toBe('c.name ILIKE :search');
        expect(searchCall!.args[1]).toEqual({ search: '%Juan%' });
      }
    });

    it('applies status filter on both queries', async () => {
      await repo.query({ status: 'CANCELLED' });

      for (const qb of [countQb, dataQb]) {
        const whereCalls = qb.getCalls().filter((c) => c.method === 'andWhere');
        const statusCall = whereCalls.find(
          (c) => typeof c.args[0] === 'string' && (c.args[0] as string).includes('s.status'),
        );
        expect(statusCall).toBeDefined();
        expect(statusCall!.args[1]).toEqual({ status: 'CANCELLED' });
      }
    });

    it('applies paymentStatus filter on both queries', async () => {
      await repo.query({ paymentStatus: 'pending' });

      for (const qb of [countQb, dataQb]) {
        const whereCalls = qb.getCalls().filter((c) => c.method === 'andWhere');
        const paymentCall = whereCalls.find(
          (c) => typeof c.args[0] === 'string' && (c.args[0] as string).includes('payment_status'),
        );
        expect(paymentCall).toBeDefined();
        expect(paymentCall!.args[1]).toEqual({ paymentStatus: 'pending' });
      }
    });

    it('applies dateFrom filter with Date object on both queries', async () => {
      await repo.query({ dateFrom: '2026-01-15' });

      for (const qb of [countQb, dataQb]) {
        const whereCalls = qb.getCalls().filter((c) => c.method === 'andWhere');
        const dateCall = whereCalls.find(
          (c) => typeof c.args[0] === 'string' && (c.args[0] as string).includes('>='),
        );
        expect(dateCall).toBeDefined();
        expect(dateCall!.args[0]).toBe('s.created_at >= :dateFrom');
        expect((dateCall!.args[1] as Record<string, unknown>).dateFrom).toBeInstanceOf(Date);
      }
    });

    it('applies dateTo with end-of-day adjustment', async () => {
      await repo.query({ dateTo: '2026-03-31' });

      for (const qb of [countQb, dataQb]) {
        const whereCalls = qb.getCalls().filter((c) => c.method === 'andWhere');
        const dateCall = whereCalls.find(
          (c) => typeof c.args[0] === 'string' && (c.args[0] as string).includes('<='),
        );
        expect(dateCall).toBeDefined();
        expect(dateCall!.args[0]).toBe('s.created_at <= :dateTo');
        const dateVal = (dateCall!.args[1] as Record<string, unknown>).dateTo as Date;
        expect(dateVal).toBeInstanceOf(Date);
        expect(dateVal.getHours()).toBe(23);
        expect(dateVal.getMinutes()).toBe(59);
        expect(dateVal.getSeconds()).toBe(59);
      }
    });

    it('skips invalid dateFrom (no WHERE added)', async () => {
      await repo.query({ dateFrom: 'not-a-date' });

      for (const qb of [countQb, dataQb]) {
        const whereCalls = qb.getCalls().filter((c) => c.method === 'andWhere');
        const dateCalls = whereCalls.filter(
          (c) => typeof c.args[0] === 'string' && (c.args[0] as string).includes('created_at'),
        );
        expect(dateCalls).toHaveLength(0);
      }
    });

    it('skips invalid dateTo (no WHERE added)', async () => {
      await repo.query({ dateTo: 'garbage' });

      for (const qb of [countQb, dataQb]) {
        const whereCalls = qb.getCalls().filter((c) => c.method === 'andWhere');
        const dateCalls = whereCalls.filter(
          (c) => typeof c.args[0] === 'string' && (c.args[0] as string).includes('created_at'),
        );
        expect(dateCalls).toHaveLength(0);
      }
    });
  });

  // ── Sorting ────────────────────────────────────────────────

  describe('sorting', () => {
    it('defaults to s.created_at DESC', async () => {
      await repo.query({});

      const dataCalls = dataQb.getCalls();
      const orderByCalls = dataCalls.filter((c) => c.method === 'orderBy');
      // The last orderBy call is the one applied to the data query
      expect(orderByCalls.length).toBeGreaterThanOrEqual(1);
      const lastOrder = orderByCalls.at(-1)!;
      expect(lastOrder.args).toEqual(['s.created_at', 'DESC']);
    });

    it('maps sortBy grossProfitCents to gross_profit_cents', async () => {
      await repo.query({ sortBy: 'grossProfitCents', sortOrder: 'asc' });

      const dataCalls = dataQb.getCalls();
      const orderByCalls = dataCalls.filter((c) => c.method === 'orderBy');
      const lastOrder = orderByCalls.at(-1)!;
      expect(lastOrder.args).toEqual(['gross_profit_cents', 'ASC']);
    });

    it('sorts by totalRevenueCents ascending', async () => {
      await repo.query({ sortBy: 'totalRevenueCents', sortOrder: 'asc' });

      const dataCalls = dataQb.getCalls();
      const orderByCalls = dataCalls.filter((c) => c.method === 'orderBy');
      const lastOrder = orderByCalls.at(-1)!;
      expect(lastOrder.args).toEqual(['total_revenue_cents', 'ASC']);
    });
  });

  // ── Pagination ─────────────────────────────────────────────

  describe('pagination', () => {
    it('applies defaults: offset 0, limit 20', async () => {
      await repo.query({});

      const dataCalls = dataQb.getCalls();
      const offsetCall = dataCalls.find((c) => c.method === 'offset');
      const limitCall = dataCalls.find((c) => c.method === 'limit');
      expect(offsetCall).toBeDefined();
      expect(limitCall).toBeDefined();
      expect(offsetCall!.args).toEqual([0]);
      expect(limitCall!.args).toEqual([20]);
    });

    it('computes offset from page and pageSize', async () => {
      await repo.query({ page: 3, pageSize: 10 });

      const dataCalls = dataQb.getCalls();
      const offsetCall = dataCalls.find((c) => c.method === 'offset');
      const limitCall = dataCalls.find((c) => c.method === 'limit');
      expect(offsetCall!.args).toEqual([20]); // (3-1)*10
      expect(limitCall!.args).toEqual([10]);
    });
  });

  // ── SELECT expressions ─────────────────────────────────────

  describe('SELECT expressions', () => {
    it('count query uses COUNT(*)::int AS total with getRawOne', async () => {
      await repo.query({});

      const countCalls = countQb.getCalls();
      const selectCalls = countCalls.filter((c) => c.method === 'select');
      const countSelect = selectCalls.find(
        (c) => c.args.length >= 2 && c.args[0] === 'COUNT(*)::int',
      );
      expect(countSelect).toBeDefined();
      expect(countSelect!.args[1]).toBe('total');

      // Verify getRawOne was called (not getRawMany for count)
      const getRawOneCall = countCalls.find((c) => c.method === 'getRawOne');
      expect(getRawOneCall).toBeDefined();
    });

    it('data query includes all required columns', async () => {
      await repo.query({});

      const dataCalls = dataQb.getCalls();
      const selectCalls = dataCalls.filter((c) => c.method === 'select');
      // The array-based select call
      const arraySelect = selectCalls.find((c) => Array.isArray(c.args[0]));
      expect(arraySelect).toBeDefined();

      const expressions = arraySelect!.args[0] as string[];
      const joined = expressions.join(' | ');

      // Core columns
      expect(joined).toContain('s.id AS sale_id');
      expect(joined).toContain('s.customer_id AS customer_id');
      expect(joined).toContain('COALESCE');
      expect(joined).toContain('customer_name');
      expect(joined).toContain('channel_reference');
      expect(joined).toContain('s.channel AS channel');
      expect(joined).toContain('s.status AS status');
      expect(joined).toContain('payment_status');
      expect(joined).toContain('amount_paid_cents');
      expect(joined).toContain('pending_balance_cents');
      expect(joined).toContain('settled_at');
      expect(joined).toContain('created_at');
      expect(joined).toContain('updated_at');

      // Financial subqueries
      expect(joined).toContain('total_revenue_cents');
      expect(joined).toContain('total_cost_cents');
      expect(joined).toContain('gross_profit_cents');
      expect(joined).toContain('line_count');

      // Subquery table references
      expect(joined).toContain('sale_lines');
      expect(joined).toContain('lot_consumption_records');
    });

    it('customer_name uses COALESCE with fallback', async () => {
      await repo.query({});

      const dataCalls = dataQb.getCalls();
      const selectCalls = dataCalls.filter((c) => c.method === 'select');
      const arraySelect = selectCalls.find((c) => Array.isArray(c.args[0]));
      const expressions = arraySelect!.args[0] as string[];

      const nameExpr = expressions.find((e) => e.includes('customer_name'));
      expect(nameExpr).toBeDefined();
      expect(nameExpr).toContain('COALESCE');
      expect(nameExpr).toContain("'Cliente desconocido'");
    });

    it('profit expression derives from revenue minus cost', async () => {
      await repo.query({});

      const dataCalls = dataQb.getCalls();
      const selectCalls = dataCalls.filter((c) => c.method === 'select');
      const arraySelect = selectCalls.find((c) => Array.isArray(c.args[0]));
      const expressions = arraySelect!.args[0] as string[];

      const profitExpr = expressions.find((e) => e.includes('gross_profit_cents'));
      expect(profitExpr).toBeDefined();
      // The expression embeds raw subqueries for revenue and cost;
      // verify it contains the subtraction operator between them
      expect(profitExpr).toContain(') - (');
      // Both subquery tables should be referenced
      expect(profitExpr).toContain('sale_lines');
      expect(profitExpr).toContain('lot_consumption_records');
    });
  });

  // ── Result transformation ──────────────────────────────────

  describe('toItem mapping', () => {
    const sampleRow = {
      sale_id: 's-abc',
      customer_id: 'cust-x',
      customer_name: 'Cliente Prueba',
      channel_reference: 'ch-ref',
      channel: 'whatsapp',
      status: 'ACTIVE',
      payment_status: 'partial',
      amount_paid_cents: 1000,
      pending_balance_cents: 4000,
      settled_at: new Date('2026-06-01T12:00:00.000Z'),
      created_at: new Date('2026-05-15T10:00:00.000Z'),
      updated_at: new Date('2026-05-20T14:30:00.000Z'),
      total_revenue_cents: '7500',
      total_cost_cents: '4200',
      gross_profit_cents: '3300',
      line_count: '3',
    };

    it('returns SaleListPage with all metadata fields', async () => {
      setupRepo({ total: 1 }, [sampleRow]);

      const result = await repo.query({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('maps all SaleListRow fields correctly', async () => {
      setupRepo({ total: 1 }, [sampleRow]);

      const result = await repo.query({});
      const item = result.items[0]!!;

      expect(item.saleId).toBe('s-abc');
      expect(item.customerId).toBe('cust-x');
      expect(item.customerName).toBe('Cliente Prueba');
      expect(item.channelReference).toBe('ch-ref');
      expect(item.channel).toBe('whatsapp');
      expect(item.status).toBe('ACTIVE');
      expect(item.paymentStatus).toBe('partial');
      expect(item.amountPaidCents).toBe(1000);
      expect(item.pendingBalanceCents).toBe(4000);
      expect(item.totalRevenueCents).toBe(7500); // parsed from string
      expect(item.totalCostCents).toBe(4200);
      expect(item.grossProfitCents).toBe(3300);
      expect(item.lineCount).toBe(3);
      expect(item.settledAt).toBe('2026-06-01T12:00:00.000Z');
      expect(item.canSettleBalance).toBe(true); // partial
      expect(item.createdAt).toBe('2026-05-15T10:00:00.000Z');
      expect(item.updatedAt).toBe('2026-05-20T14:30:00.000Z');
    });

    it('canSettleBalance: false for paid', async () => {
      setupRepo({ total: 1 }, [{ ...sampleRow, payment_status: 'paid' }]);

      const result = await repo.query({});
      expect(result.items[0]!.canSettleBalance).toBe(false);
    });

    it('canSettleBalance: true for pending', async () => {
      setupRepo({ total: 1 }, [{ ...sampleRow, payment_status: 'pending' }]);

      const result = await repo.query({});
      expect(result.items[0]!.canSettleBalance).toBe(true);
    });

    it('canSettleBalance: true for partial', async () => {
      setupRepo({ total: 1 }, [{ ...sampleRow, payment_status: 'partial' }]);

      const result = await repo.query({});
      expect(result.items[0]!.canSettleBalance).toBe(true);
    });

    it('settledAt is null when DB value is null', async () => {
      setupRepo({ total: 1 }, [{ ...sampleRow, settled_at: null }]);

      const result = await repo.query({});
      expect(result.items[0]!.settledAt).toBeNull();
    });

    it('totalPages computed: ceil(total/pageSize)', async () => {
      setupRepo({ total: 25 }, []);

      const result = await repo.query({ pageSize: 10 });
      expect(result.totalPages).toBe(3);
      expect(result.total).toBe(25);
    });

    it('totalPages is 1 when total is 0', async () => {
      setupRepo({ total: 0 }, []);

      const result = await repo.query({});
      expect(result.totalPages).toBe(1);
      expect(result.total).toBe(0);
    });

    it('returns empty items when no rows match', async () => {
      setupRepo({ total: 0 }, []);

      const result = await repo.query({});
      expect(result.items).toEqual([]);
    });
  });
});
