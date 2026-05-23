/**
 * E2E tests for GET /api/v1/sales — paginated listing endpoint.
 *
 * Verifies:
 * - Pagination metadata (total, page, pageSize, totalPages)
 * - Default sort by createdAt DESC
 * - Search by customer name
 * - Filter by status and paymentStatus
 * - Sort by financial columns (revenue, cost, profit)
 * - Payment fields in response (customerName, paymentStatus, amountPaidCents, etc.)
 * - canSettleBalance derivation
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express, { json, type Express } from 'express';
import { errorMiddleware } from '../../../src/infrastructure/http/index.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { CustomerRepository } from '../../../src/modules/customers/domain/CustomerRepository.js';
import type { VariantRepository } from '../../../src/modules/inventory/domain/VariantRepository.js';
import type { ProductRepository } from '../../../src/modules/inventory/domain/ProductRepository.js';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { SaleListItemReadRepository, SaleListItem } from '../../../src/modules/sales-returns/application/ports/SaleListItemReadRepository.js';
import type {
  SaleListReadRepository,
  SaleListQuery,
  SaleListRow,
  SaleListPage,
} from '../../../src/modules/sales-returns/application/ports/SaleListReadRepository.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { Customer } from '../../../src/modules/customers/domain/Customer.js';
import { CustomerId } from '../../../src/modules/customers/domain/CustomerId.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { CreateSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/CreateSaleUseCase.js';
import { CancelSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/CancelSaleUseCase.js';
import { ReturnFullSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/ReturnFullSaleUseCase.js';
import { SettleSaleBalanceUseCase } from '../../../src/modules/sales-returns/application/use-cases/SettleSaleBalanceUseCase.js';
import { ListSalesUseCase } from '../../../src/modules/sales-returns/application/use-cases/ListSalesUseCase.js';
import { SaleController } from '../../../src/modules/sales-returns/interfaces/http/SaleController.js';
import { createSaleRouter } from '../../../src/modules/sales-returns/interfaces/http/sale-routes.js';

// ── Fakes ──────────────────────────────────────────────────────

class FakeUnitOfWork implements UnitOfWork {
  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    return await fn({});
  }
}

class FakeCustomerRepo implements CustomerRepository {
  customers = new Map<string, Customer>();
  async save(c: Customer): Promise<void> { this.customers.set(c.id.toString(), c); }
  async findById(id: CustomerId): Promise<Customer | null> { return this.customers.get(id.toString()) ?? null; }
  async findAll(): Promise<Customer[]> { return Array.from(this.customers.values()); }
}

class FakeVariantRepo implements VariantRepository {
  async findById(): Promise<any> { return {}; }
  async findAll(): Promise<any[]> { return []; }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async save(): Promise<void> {}
  async findBySku(): Promise<any> { return null; }
  async findByProductId(): Promise<any[]> { return []; }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async delete(): Promise<void> {}
}

class FakeProductRepo implements ProductRepository {
  async findById(): Promise<any> { return { resolveUnitPrice: () => Money.fromCents(1000) }; }
  async findAll(): Promise<any[]> { return []; }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async save(): Promise<void> {}
  async findByAlias(): Promise<any> { return null; }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async delete(): Promise<void> {}
  async findAllActive(): Promise<any[]> { return []; }
}

class FakeSaleRepo implements SaleRepository {
  private map = new Map<string, SaleEntity>();
  async save(s: SaleEntity): Promise<void> { this.map.set(s.id.toString(), s); }
  async findById(): Promise<SaleEntity | null> { return null; }
  async findByCustomerId(): Promise<SaleEntity[]> { return []; }
  async findByIds(): Promise<SaleEntity[]> { return []; }
  async findAll(): Promise<SaleEntity[]> { return Array.from(this.map.values()); }
}

class FakeSaleListItemRepo implements SaleListItemReadRepository {
  async findBySaleIds(): Promise<SaleListItem[]> { return []; }
}

class FakeSaleListReadRepo implements SaleListReadRepository {
  rows: SaleListRow[] = [];

  async query(q: SaleListQuery): Promise<SaleListPage> {
    let filtered = [...this.rows];

    if (q.search) {
      const term = q.search.toLowerCase();
      filtered = filtered.filter((r) => r.customerName.toLowerCase().includes(term));
    }
    if (q.status) filtered = filtered.filter((r) => r.status === q.status);
    if (q.paymentStatus) filtered = filtered.filter((r) => r.paymentStatus === q.paymentStatus);
    if (q.dateFrom) {
      const from = new Date(q.dateFrom);
      filtered = filtered.filter((r) => new Date(r.createdAt) >= from);
    }
    if (q.dateTo) {
      const toRaw = new Date(q.dateTo);
      const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999);
      filtered = filtered.filter((r) => new Date(r.createdAt) <= to);
    }

    const sortBy = q.sortBy ?? 'createdAt';
    const sortOrder = q.sortOrder ?? 'desc';
    filtered.sort((a, b) => {
      let va: number, vb: number;
      switch (sortBy) {
        case 'totalRevenueCents': va = a.totalRevenueCents; vb = b.totalRevenueCents; break;
        case 'totalCostCents': va = a.totalCostCents; vb = b.totalCostCents; break;
        case 'grossProfitCents': va = a.grossProfitCents; vb = b.grossProfitCents; break;
        default: va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime(); break;
      }
      return sortOrder === 'asc' ? va - vb : vb - va;
    });

    const total = filtered.length;
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const tp = total > 0 ? Math.ceil(total / pageSize) : 1;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return { items, total, page, pageSize, totalPages: tp };
  }
}

// ── Helpers ────────────────────────────────────────────────────

function makeRow(overrides: Partial<SaleListRow> = {}): SaleListRow {
  return {
    saleId: 's1',
    customerId: 'cust-1',
    customerName: 'Cliente A',
    channelReference: null,
    channel: 'web',
    status: 'ACTIVE',
    paymentStatus: 'paid',
    amountPaidCents: 5000,
    pendingBalanceCents: 0,
    totalRevenueCents: 5000,
    totalCostCents: 3000,
    grossProfitCents: 2000,
    lineCount: 1,
    settledAt: null,
    canSettleBalance: false,
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
    ...overrides,
  };
}

// ── Test app factory ───────────────────────────────────────────

interface TestApp {
  app: Express;
  listRepo: FakeSaleListReadRepo;
}

function createApp(): TestApp {
  const customerRepo = new FakeCustomerRepo();
  const variantRepo = new FakeVariantRepo();
  const productRepo = new FakeProductRepo();
  const saleRepo = new FakeSaleRepo();
  const itemRepo = new FakeSaleListItemRepo();
  const listRepo = new FakeSaleListReadRepo();

  const createSaleUseCase = new CreateSaleUseCase(customerRepo, variantRepo, productRepo);
  const cancelSaleUseCase = new CancelSaleUseCase();
  const returnFullSaleUseCase = new ReturnFullSaleUseCase();
  const settleSaleBalanceUseCase = new SettleSaleBalanceUseCase();
  const listSalesUseCase = new ListSalesUseCase(saleRepo, itemRepo, listRepo);
  const uow = new FakeUnitOfWork();

  const controller = new SaleController(
    createSaleUseCase,
    cancelSaleUseCase,
    returnFullSaleUseCase,
    settleSaleBalanceUseCase,
    uow,
    listSalesUseCase,
  );

  const app = express();
  app.use(json());
  app.use('/api/v1', createSaleRouter(controller));
  app.use(errorMiddleware);

  return { app, listRepo };
}

// ── Tests ──────────────────────────────────────────────────────

describe('GET /api/v1/sales — paginated listing', () => {
  let infra: TestApp;
  let app: Express;

  beforeAll(() => {
    infra = createApp();
    app = infra.app;
  });

  beforeEach(() => {
    infra.listRepo.rows = [];
  });

  describe('pagination metadata', () => {
    it('returns pagination envelope with items, total, page, pageSize, totalPages', async () => {
      infra.listRepo.rows = [
        makeRow({ saleId: 's1', customerName: 'A' }),
        makeRow({ saleId: 's2', customerName: 'B' }),
        makeRow({ saleId: 's3', customerName: 'C' }),
      ];

      const res = await request(app).get('/api/v1/sales?page=1&pageSize=2');
      expect(res.status).toBe(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('pageSize');
      expect(res.body).toHaveProperty('totalPages');

      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(2);
      expect(res.body.totalPages).toBe(2);
    });

    it('defaults to page 1 with pageSize 20', async () => {
      infra.listRepo.rows = Array.from({ length: 5 }, (_, i) =>
        makeRow({ saleId: `s${i + 1}`, customerName: `C${i + 1}`, createdAt: `2026-05-${String(10 + i).padStart(2, '0')}T10:00:00.000Z` }),
      );

      const res = await request(app).get('/api/v1/sales');
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.items).toHaveLength(5); // all fit on one page
    });
  });

  describe('default ordering', () => {
    it('returns newest sales first (createdAt DESC)', async () => {
      infra.listRepo.rows = [
        makeRow({ saleId: 'oldest', customerName: 'Old', createdAt: '2026-01-01T10:00:00.000Z' }),
        makeRow({ saleId: 'newest', customerName: 'New', createdAt: '2026-06-01T10:00:00.000Z' }),
        makeRow({ saleId: 'middle', customerName: 'Mid', createdAt: '2026-03-01T10:00:00.000Z' }),
      ];

      const res = await request(app).get('/api/v1/sales');
      expect(res.status).toBe(200);
      expect(res.body.items[0].saleId).toBe('newest');
      expect(res.body.items[1].saleId).toBe('middle');
      expect(res.body.items[2].saleId).toBe('oldest');
    });
  });

  describe('search by customer name', () => {
    it('filters by customer name substring (case-insensitive)', async () => {
      infra.listRepo.rows = [
        makeRow({ saleId: 's1', customerName: 'Juan Pérez', createdAt: '2026-01-01T10:00:00.000Z' }),
        makeRow({ saleId: 's2', customerName: 'María López', createdAt: '2026-02-01T10:00:00.000Z' }),
        makeRow({ saleId: 's3', customerName: 'Juan García', createdAt: '2026-03-01T10:00:00.000Z' }),
      ];

      const res = await request(app).get('/api/v1/sales?search=juan');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      // Default sort: DESC by createdAt → newer first
      expect(res.body.items[0].saleId).toBe('s3'); // Mar 2026
      expect(res.body.items[1].saleId).toBe('s1'); // Jan 2026
    });
  });

  describe('payment status filter', () => {
    it('filters by paymentStatus', async () => {
      infra.listRepo.rows = [
        makeRow({ saleId: 's1', paymentStatus: 'paid', amountPaidCents: 5000, pendingBalanceCents: 0, canSettleBalance: false }),
        makeRow({ saleId: 's2', paymentStatus: 'pending', amountPaidCents: 0, pendingBalanceCents: 3000, canSettleBalance: true }),
        makeRow({ saleId: 's3', paymentStatus: 'partial', amountPaidCents: 1000, pendingBalanceCents: 2000, canSettleBalance: true }),
      ];

      const res = await request(app).get('/api/v1/sales?paymentStatus=pending');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].saleId).toBe('s2');
    });
  });

  describe('status filter', () => {
    it('filters by sale status', async () => {
      infra.listRepo.rows = [
        makeRow({ saleId: 's1', status: 'ACTIVE' }),
        makeRow({ saleId: 's2', status: 'CANCELLED' }),
      ];

      const res = await request(app).get('/api/v1/sales?status=ACTIVE');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].saleId).toBe('s1');
    });
  });

  describe('sort by financial columns', () => {
    it('sorts by grossProfitCents desc', async () => {
      infra.listRepo.rows = [
        makeRow({ saleId: 'low', grossProfitCents: 500, createdAt: '2026-01-01T10:00:00.000Z' }),
        makeRow({ saleId: 'high', grossProfitCents: 5000, createdAt: '2026-01-02T10:00:00.000Z' }),
        makeRow({ saleId: 'mid', grossProfitCents: 2000, createdAt: '2026-01-03T10:00:00.000Z' }),
      ];

      const res = await request(app).get('/api/v1/sales?sortBy=grossProfitCents&sortOrder=desc');
      expect(res.status).toBe(200);
      expect(res.body.items[0].saleId).toBe('high');
      expect(res.body.items[1].saleId).toBe('mid');
      expect(res.body.items[2].saleId).toBe('low');
    });
  });

  describe('response row shape', () => {
    it('includes customerName, payment fields, and canSettleBalance', async () => {
      infra.listRepo.rows = [
        makeRow({ saleId: 's1', customerName: 'Cliente Prueba', paymentStatus: 'partial',
          amountPaidCents: 1000, pendingBalanceCents: 4000, canSettleBalance: true }),
      ];

      const res = await request(app).get('/api/v1/sales');
      expect(res.status).toBe(200);
      expect(res.body.items[0]).toMatchObject({
        saleId: 's1',
        customerName: 'Cliente Prueba',
        paymentStatus: 'partial',
        amountPaidCents: 1000,
        pendingBalanceCents: 4000,
        canSettleBalance: true,
        totalRevenueCents: 5000,
        totalCostCents: 3000,
        grossProfitCents: 2000,
      });
    });

    it('includes items array on every row', async () => {
      infra.listRepo.rows = [makeRow({ saleId: 's1' })];

      const res = await request(app).get('/api/v1/sales');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items[0].items)).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects invalid paymentStatus', async () => {
      const res = await request(app).get('/api/v1/sales?paymentStatus=invalid');
      expect(res.status).toBe(400);
    });

    it('rejects invalid sortBy', async () => {
      const res = await request(app).get('/api/v1/sales?sortBy=invalid');
      expect(res.status).toBe(400);
    });

    it('rejects invalid page', async () => {
      const res = await request(app).get('/api/v1/sales?page=0');
      expect(res.status).toBe(400);
    });
  });

  describe('empty results', () => {
    it('returns empty items with correct pagination metadata', async () => {
      infra.listRepo.rows = [];
      const res = await request(app).get('/api/v1/sales');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(1);
    });
  });

  describe('second page', () => {
    it('returns correct second page of results', async () => {
      infra.listRepo.rows = Array.from({ length: 5 }, (_, i) =>
        makeRow({ saleId: `s${i + 1}`, createdAt: `2026-05-${String(10 + i).padStart(2, '0')}T10:00:00.000Z` }),
      );

      const res = await request(app).get('/api/v1/sales?page=2&pageSize=2');
      expect(res.status).toBe(200);
      // Page 1: s5, s4; Page 2: s3, s2; Page 3: s1
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(5);
      expect(res.body.totalPages).toBe(3);
    });
  });

  describe('combined filters, search, sort, and pagination', () => {
    it('applies search + date range + page + pageSize + descending financial sort together', async () => {
      // Seed sales across different customers, dates, and profit values
      infra.listRepo.rows = [
        makeRow({ saleId: 'c1', customerName: 'Alpha S.A.', createdAt: '2026-01-10T10:00:00.000Z', grossProfitCents: 500 }),
        makeRow({ saleId: 'c2', customerName: 'Beta Corp', createdAt: '2026-02-15T10:00:00.000Z', grossProfitCents: 2000 }),
        makeRow({ saleId: 'c3', customerName: 'Gamma Corp', createdAt: '2026-02-28T10:00:00.000Z', grossProfitCents: 3000 }),
        makeRow({ saleId: 'c4', customerName: 'Delta Corp', createdAt: '2026-03-10T10:00:00.000Z', grossProfitCents: 800 }),
        makeRow({ saleId: 'c5', customerName: 'Zeta LLC', createdAt: '2026-04-05T10:00:00.000Z', grossProfitCents: 1500 }),
        makeRow({ saleId: 'c6', customerName: 'Omega Corp', createdAt: '2026-03-20T10:00:00.000Z', grossProfitCents: 400 }),
      ];

      // Combined: search="corp", 2026-02-01..2026-03-31,
      // page=1, pageSize=2, sortBy=grossProfitCents desc
      const res = await request(app).get(
        '/api/v1/sales?search=corp&dateFrom=2026-02-01&dateTo=2026-03-31&page=1&pageSize=2&sortBy=grossProfitCents&sortOrder=desc',
      );
      expect(res.status).toBe(200);

      // Search "corp" matches: Beta Corp, Gamma Corp, Delta Corp, Omega Corp (c2, c3, c4, c6)
      // Excluded by date: c1 (Jan 10 before range), c5 (Apr 05 after range)
      // Sorted by profit desc: c3(3000), c2(2000), c4(800), c6(400)
      // Page 1 with pageSize 2 → first 2 items
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].saleId).toBe('c3'); // highest profit (3000)
      expect(res.body.items[1].saleId).toBe('c2'); // second highest (2000)
      expect(res.body.total).toBe(4);       // 4 matches total
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(2);
      expect(res.body.totalPages).toBe(2);  // 4 items / 2 per page
    });

    it('returns empty for second page when only 4 items match with pageSize 2', async () => {
      infra.listRepo.rows = [
        makeRow({ saleId: 'c2', customerName: 'Beta Corp', createdAt: '2026-02-15T10:00:00.000Z', grossProfitCents: 2000 }),
        makeRow({ saleId: 'c3', customerName: 'Gamma Corp', createdAt: '2026-02-28T10:00:00.000Z', grossProfitCents: 3000 }),
        makeRow({ saleId: 'c4', customerName: 'Delta Corp', createdAt: '2026-03-10T10:00:00.000Z', grossProfitCents: 800 }),
        makeRow({ saleId: 'c6', customerName: 'Omega Corp', createdAt: '2026-03-20T10:00:00.000Z', grossProfitCents: 400 }),
        makeRow({ saleId: 'c7', customerName: 'Theta Corp', createdAt: '2026-02-01T10:00:00.000Z', grossProfitCents: 100 }),
        makeRow({ saleId: 'c8', customerName: 'Sigma Corp', createdAt: '2026-03-15T10:00:00.000Z', grossProfitCents: 600 }),
      ];

      // Page 3 of 2 (6 items / 2 per page = 3 pages) — profit desc
      const res = await request(app).get(
        '/api/v1/sales?search=corp&page=3&pageSize=2&sortBy=grossProfitCents&sortOrder=desc',
      );
      expect(res.status).toBe(200);
      // Sorted by profit desc: c3(3000), c2(2000), c4(800), c8(600), c6(400), c7(100)
      // Page 3: c6(400), c7(100)
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].saleId).toBe('c6');
      expect(res.body.items[1].saleId).toBe('c7');
      expect(res.body.page).toBe(3);
      expect(res.body.pageSize).toBe(2);
      expect(res.body.total).toBe(6);
      expect(res.body.totalPages).toBe(3);
    });
  });
});
