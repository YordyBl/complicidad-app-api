/**
 * E2E full-flow test: login → customer → product → purchase → multi-item sale
 * → full return → reports reconcile.
 *
 * These tests use supertest against an Express application with fakes
 * injected for all repositories. They do NOT require a running PostgreSQL.
 *
 * LIMITATION: Partial returns are not yet implemented in v1 — only full-sale
 * returns are supported. The test covers: login, customer CRUD, product
 * creation, purchase registration, multi-item sale, full return, reports.
 *
 * When a real PostgreSQL DB and full authentication middleware are available,
 * these tests should be expanded to use real JWT auth and DB-backed flows.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { json, type Express } from 'express';
import { errorMiddleware } from '../../src/infrastructure/http/index.js';
import { LoginUseCase } from '../../src/modules/auth-users/application/use-cases/LoginUseCase.js';
import { RegisterUserUseCase } from '../../src/modules/auth-users/application/use-cases/RegisterUserUseCase.js';
import { AuthController } from '../../src/modules/auth-users/interfaces/http/AuthController.js';
import { createAuthRouter } from '../../src/modules/auth-users/interfaces/http/auth-routes.js';
import { User } from '../../src/modules/auth-users/domain/User.js';
import { UserId } from '../../src/modules/auth-users/domain/UserId.js';
import { Money } from '../../src/shared/domain/Money.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../src/shared/application/UnitOfWork.js';
import type { UserRepository } from '../../src/modules/auth-users/domain/UserRepository.js';
import type { PasswordHashService } from '../../src/modules/auth-users/domain/PasswordHashService.js';
import type { TokenService, TokenPayload } from '../../src/modules/auth-users/domain/TokenService.js';
import type { CustomerRepository } from '../../src/modules/customers/domain/CustomerRepository.js';
import type { VariantRepository } from '../../src/modules/inventory/domain/VariantRepository.js';
import type { ProductRepository } from '../../src/modules/inventory/domain/ProductRepository.js';
import type { InventoryLotRepository } from '../../src/modules/inventory/domain/InventoryLotRepository.js';
import type { PurchaseRepository } from '../../src/modules/inventory/domain/PurchaseRepository.js';
import type { CashLedgerRepository } from '../../src/modules/accounting-reports/domain/CashLedgerRepository.js';
import type { CashBoxRepository } from '../../src/modules/accounting-reports/domain/CashBoxRepository.js';
import type { SaleRepository } from '../../src/modules/sales-returns/domain/SaleRepository.js';
import type { Variant } from '../../src/modules/inventory/domain/Variant.js';
import type { PurchaseLot } from '../../src/modules/inventory/domain/PurchaseLot.js';
import type { CashLedgerEntry } from '../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import type { CashLedgerEntryId } from '../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { CashBox } from '../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../src/modules/accounting-reports/domain/CashBoxId.js';
import { toLimaBusinessDate } from '../../src/modules/accounting-reports/domain/LimaBusinessDate.js';
import type { VariantId } from '../../src/modules/inventory/domain/VariantId.js';
import type { PurchaseLotId } from '../../src/modules/inventory/domain/PurchaseLotId.js';
import type { PurchaseId } from '../../src/modules/inventory/domain/PurchaseId.js';
import type { ProductId } from '../../src/modules/inventory/domain/ProductId.js';
import type { Sku } from '../../src/modules/inventory/domain/Sku.js';
import { Customer } from '../../src/modules/customers/domain/Customer.js';
import { CustomerId } from '../../src/modules/customers/domain/CustomerId.js';
import { Variant as VariantEntity } from '../../src/modules/inventory/domain/Variant.js';
import { VariantId as VariantIdEntity } from '../../src/modules/inventory/domain/VariantId.js';
import { Product as ProductEntity } from '../../src/modules/inventory/domain/Product.js';
import { ProductId as ProductIdEntity } from '../../src/modules/inventory/domain/ProductId.js';
import { Sku as SkuEntity } from '../../src/modules/inventory/domain/Sku.js';
import { Sale as SaleEntity } from '../../src/modules/sales-returns/domain/Sale.js';
import { SaleId as SaleIdEntity } from '../../src/modules/sales-returns/domain/SaleId.js';
import { CreateSaleUseCase } from '../../src/modules/sales-returns/application/use-cases/CreateSaleUseCase.js';
import { CancelSaleUseCase } from '../../src/modules/sales-returns/application/use-cases/CancelSaleUseCase.js';
import { ReturnFullSaleUseCase } from '../../src/modules/sales-returns/application/use-cases/ReturnFullSaleUseCase.js';
import { SaleController } from '../../src/modules/sales-returns/interfaces/http/SaleController.js';
import { createSaleRouter } from '../../src/modules/sales-returns/interfaces/http/sale-routes.js';
import { CreateProductUseCase } from '../../src/modules/inventory/application/use-cases/CreateProductUseCase.js';
import { RegisterPurchaseUseCase } from '../../src/modules/inventory/application/use-cases/RegisterPurchaseUseCase.js';
import { ProductController } from '../../src/modules/inventory/interfaces/http/ProductController.js';
import { InventoryController } from '../../src/modules/inventory/interfaces/http/InventoryController.js';
import { createInventoryRouter } from '../../src/modules/inventory/interfaces/http/inventory-routes.js';
import { GetLiquidityUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetLiquidityUseCase.js';
import { GetSalesTotalUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetSalesTotalUseCase.js';
import { GetFifoCostsUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetFifoCostsUseCase.js';
import { GetGrossProfitUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetGrossProfitUseCase.js';
import { GetStockInvestmentUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetStockInvestmentUseCase.js';
import { GetReinvestmentUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetReinvestmentUseCase.js';
import { GetOperatingCapitalUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetOperatingCapitalUseCase.js';
import { ReportController } from '../../src/modules/accounting-reports/interfaces/http/ReportController.js';
import { createReportRouter } from '../../src/modules/accounting-reports/interfaces/http/report-routes.js';
import type { ReportReadRepository } from '../../src/modules/accounting-reports/domain/ReportReadRepository.js';
import type { CashClosingRepository } from '../../src/modules/accounting-reports/domain/CashClosingRepository.js';
import { ManualCashCloseUseCase } from '../../src/modules/accounting-reports/application/use-cases/ManualCashCloseUseCase.js';
import { GetStockByProductUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetStockByProductUseCase.js';
import { GetLotsUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetLotsUseCase.js';

// ── Fake auth dependencies ────────────────────────────────────

class FakePasswordHasher implements PasswordHashService {
  async hash(plain: string): Promise<string> { return `hashed:${plain}`; }
  async verify(plain: string, hash: string): Promise<boolean> { return hash === `hashed:${plain}`; }
}

class FakeTokenService implements TokenService {
  async sign(_p: Omit<TokenPayload, 'iat' | 'exp'>, _e?: string): Promise<string> {
    return `token:${_p.sub}:${_p.role}`;
  }
  async verify(_token: string): Promise<TokenPayload> { throw new Error('N/A'); }
}

class FakeUserRepo implements UserRepository {
  private users = new Map<string, User>();
  setUser(u: User): void { this.users.set(u.id.toString(), u); }
  async findById(id: UserId): Promise<User | null> { return this.users.get(id.toString()) ?? null; }
  async findByEmail(e: string): Promise<User | null> {
    for (const u of this.users.values()) { if (u.email === e) return u; }
    return null;
  }
  async save(u: User): Promise<void> { this.users.set(u.id.toString(), u); }
  async delete(id: UserId): Promise<void> { this.users.delete(id.toString()); }
  async findAll(): Promise<User[]> { return Array.from(this.users.values()); }
}

// ── Fakes for all repositories ────────────────────────────────

class FakeCustomerRepo implements CustomerRepository {
  customers = new Map<string, Customer>();
  async findById(id: CustomerId): Promise<Customer | null> { return this.customers.get(id.toString()) ?? null; }
  async save(c: Customer): Promise<void> { this.customers.set(c.id.toString(), c); }
  async findAll(): Promise<Customer[]> { return Array.from(this.customers.values()); }
}

class FakeVariantRepo implements VariantRepository {
  variants = new Map<string, Variant>();
  setVariant(v: Variant): void { this.variants.set(v.id.toString(), v); }
  async findById(id: VariantId): Promise<Variant | null> { return this.variants.get(id.toString()) ?? null; }
  async findBySku(sku: Sku): Promise<Variant | null> {
    for (const v of this.variants.values()) { if (v.sku.equals(sku)) return v; }
    return null;
  }
  async findByProductId(pId: ProductId): Promise<Variant[]> {
    return Array.from(this.variants.values()).filter((v) => v.productId.equals(pId));
  }
  async save(v: Variant): Promise<void> { this.variants.set(v.id.toString(), v); }
  async delete(id: VariantId): Promise<void> { this.variants.delete(id.toString()); }
}

class FakeProductRepo implements ProductRepository {
  products = new Map<string, import('../../src/modules/inventory/domain/Product.js').Product>();
  async findById(id: ProductId) { return this.products.get(id.toString()) ?? null; }
  async findByAlias(_alias: string): Promise<import('../../src/modules/inventory/domain/Product.js').Product[]> {
    return Array.from(this.products.values());
  }
  async findAllActive(): Promise<import('../../src/modules/inventory/domain/Product.js').Product[]> {
    return Array.from(this.products.values());
  }
  async save(p: import('../../src/modules/inventory/domain/Product.js').Product): Promise<void> {
    this.products.set(p.id.toString(), p);
  }
  async findAll(): Promise<import('../../src/modules/inventory/domain/Product.js').Product[]> {
    return Array.from(this.products.values());
  }
  async delete(id: ProductId): Promise<void> { this.products.delete(id.toString()); }
}

class FakeInventoryLotRepo implements InventoryLotRepository {
  lots = new Map<string, PurchaseLot>();
  async findById(id: PurchaseLotId): Promise<PurchaseLot | null> { return this.lots.get(id.toString()) ?? null; }
  async findByIds(ids: PurchaseLotId[]): Promise<PurchaseLot[]> {
    return ids.map((id) => this.lots.get(id.toString())).filter((l): l is PurchaseLot => l !== undefined);
  }
  async findByVariantIdOrderedByDate(vId: VariantId, _lock?: boolean): Promise<PurchaseLot[]> {
    return Array.from(this.lots.values())
      .filter((l) => l.variantId.equals(vId))
      .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());
  }
  async save(lot: PurchaseLot): Promise<void> { this.lots.set(lot.id.toString(), lot); }
  async saveMany(lots: PurchaseLot[]): Promise<void> { for (const l of lots) this.lots.set(l.id.toString(), l); }
  async delete(id: PurchaseLotId): Promise<void> { this.lots.delete(id.toString()); }
  async findByIdForUpdate(id: PurchaseLotId): Promise<PurchaseLot | null> { return this.lots.get(id.toString()) ?? null; }
  async hasConsumptionRecords(): Promise<boolean> { return false; }
}

class FakePurchaseRepo implements PurchaseRepository {
  purchases = new Map<string, import('../../src/modules/inventory/domain/Purchase.js').Purchase>();
  async findById(id: PurchaseId) { return this.purchases.get(id.toString()) ?? null; }
  async save(p: import('../../src/modules/inventory/domain/Purchase.js').Purchase): Promise<void> {
    this.purchases.set(p.id.toString(), p);
  }
  async delete(id: PurchaseId): Promise<void> { this.purchases.delete(id.toString()); }
}

class FakeSaleRepo implements SaleRepository {
  sales = new Map<string, SaleEntity>();
  async save(sale: SaleEntity): Promise<void> { this.sales.set(sale.id.toString(), sale); }
  async findById(id: SaleIdEntity): Promise<SaleEntity | null> { return this.sales.get(id.toString()) ?? null; }
  async findByCustomerId(cId: string): Promise<SaleEntity[]> {
    return Array.from(this.sales.values()).filter((s) => s.customerId === cId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async findByIds(ids: SaleIdEntity[]): Promise<SaleEntity[]> {
    return ids.map((id) => this.sales.get(id.toString())).filter(Boolean) as SaleEntity[];
  }
  async findAll(): Promise<SaleEntity[]> {
    return Array.from(this.sales.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

class FakeCashLedgerRepo implements CashLedgerRepository {
  entries: CashLedgerEntry[] = [];
  async append(entry: CashLedgerEntry): Promise<void> { this.entries.push(entry); }
  async findAllOrdered(): Promise<CashLedgerEntry[]> { return [...this.entries]; }
  async findById(id: CashLedgerEntryId): Promise<CashLedgerEntry | null> {
    return this.entries.find((e) => e.id.toString() === id.toString()) ?? null;
  }

  async findByCashBoxId(cashBoxId: string): Promise<CashLedgerEntry[]> {
    return this.entries.filter((e) => e.cashBoxId?.toString() === cashBoxId);
  }
}

// ── Fake scope for use cases ──────────────────────────────────

interface FullFlowScope extends UnitOfWorkScope {
  sales: SaleRepository;
  inventoryLots: InventoryLotRepository;
  cashLedger: CashLedgerRepository;
  purchases: PurchaseRepository;
  cashBoxes: CashBoxRepository;
}

class FakeCashBoxRepoE2E implements CashBoxRepository {
  boxes = new Map<string, CashBox>();

  async save(box: CashBox): Promise<void> {
    this.boxes.set(box.id.toString(), box);
  }

  async findByBusinessDate(businessDate: string): Promise<CashBox | null> {
    for (const box of this.boxes.values()) {
      if (box.businessDate === businessDate) return box;
    }
    return null;
  }

  async findCurrent(): Promise<CashBox | null> {
    for (const box of this.boxes.values()) {
      if (box.isOpen()) return box;
    }
    return null;
  }

  async findById(id: CashBoxId): Promise<CashBox | null> {
    return this.boxes.get(id.toString()) ?? null;
  }

  async findAllOrdered(): Promise<CashBox[]> {
    return Array.from(this.boxes.values())
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  }

  async findLastClosed(): Promise<CashBox | null> {
    let last: CashBox | null = null;
    for (const box of this.boxes.values()) {
      if (box.isClosed() && (!last || box.businessDate > last.businessDate)) {
        last = box;
      }
    }
    return last;
  }
}

class FakeUoW implements UnitOfWork {
  constructor(public scope: FullFlowScope) {}
  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    return fn(this.scope);
  }
}

// ── Fake ReportReadRepository ──────────────────────────────────

class FakeReportRepo implements ReportReadRepository {
  constructor(
    private cashLedger: FakeCashLedgerRepo,
    private lotRepo: FakeInventoryLotRepo,
    private saleRepo: FakeSaleRepo,
  ) {}

  async getLiquidityCents(): Promise<number> {
    return this.cashLedger.entries.reduce((sum, e) => sum + e.amount.cents, 0);
  }

  async getStockInvestmentCents(): Promise<number> {
    let total = 0;
    for (const lot of this.lotRepo.lots.values()) {
      if (lot.remainingQuantity > 0) {
        total += lot.remainingQuantity * lot.unitCost.cents;
      }
    }
    return total;
  }

  async getSalesIncomeCents(): Promise<number> {
    let total = 0;
    for (const sale of this.saleRepo.sales.values()) {
      if (sale.status === 'ACTIVE') {
        total += sale.totalRevenue.cents;
      }
    }
    return total;
  }

  async getFifoCostsCents(): Promise<number> {
    let total = 0;
    for (const sale of this.saleRepo.sales.values()) {
      if (sale.status === 'ACTIVE') {
        total += sale.totalCost.cents;
      }
    }
    return total;
  }

  async getReinvestmentCents(): Promise<number> {
    let total = 0;
    for (const entry of this.cashLedger.entries) {
      if (entry.type === 'PURCHASE_OUTFLOW') {
        total += Math.abs(entry.amount.cents);
      }
    }
    return total;
  }

  async getStockByProduct(): Promise<import('../../src/modules/accounting-reports/domain/ReportReadRepository.js').StockByProductItem[]> {
    return [];
  }

  async getLots(): Promise<import('../../src/modules/accounting-reports/domain/ReportReadRepository.js').LotReportItem[]> {
    return [];
  }
}

class FakeCashClosingRepo implements CashClosingRepository {
  async save(_c: import('../../src/modules/accounting-reports/domain/CashClosing.js').CashClosing): Promise<void> {
    // no-op fake
  }
  async findLast(): Promise<import('../../src/modules/accounting-reports/domain/CashClosing.js').CashClosing | null> { return null; }
}

// ── Fixtures ──────────────────────────────────────────────────

function createTestVariant(id: string, skuStr: string, productId?: string): VariantEntity {
  const skuResult = SkuEntity.from(skuStr);
  if (!skuResult.ok) throw new Error('Invalid SKU');
  return new VariantEntity(
    VariantIdEntity.from(id), ProductIdEntity.from(productId ?? ProductIdEntity.generate().toString()), skuResult.value,
    {}, true,
    new Date('2026-01-01'), new Date('2026-01-01'),
  );
}

function createTestProduct(id: string, salePriceCents: number): ProductEntity {
  return new ProductEntity(
    ProductIdEntity.from(id), 'Test Product', null,
    'test-product',
    Money.fromCents(salePriceCents), null, [],
    true, new Date('2026-01-01'), new Date('2026-01-01'),
  );
}

function createTestCustomer(id: string): Customer {
  return new Customer(
    CustomerId.from(id), 'Test Customer', 'test@example.com', '+1234567890',
    null, null, null, null,
    new Date('2026-01-01'), new Date('2026-01-01'),
  );
}

// ── App factory ────────────────────────────────────────────────

interface TestInfra {
  customerRepo: FakeCustomerRepo;
  variantRepo: FakeVariantRepo;
  lotRepo: FakeInventoryLotRepo;
  saleRepo: FakeSaleRepo;
  cashRepo: FakeCashLedgerRepo;
  purchaseRepo: FakePurchaseRepo;
  productRepo: FakeProductRepo;
  reportRepo: FakeReportRepo;
  app: Express;
}

function createTestApp(): TestInfra {
  const customerRepo = new FakeCustomerRepo();
  const variantRepo = new FakeVariantRepo();
  const lotRepo = new FakeInventoryLotRepo();
  const saleRepo = new FakeSaleRepo();
  const cashRepo = new FakeCashLedgerRepo();
  const purchaseRepo = new FakePurchaseRepo();
  const cashBoxRepo = new FakeCashBoxRepoE2E();

  // Set up an open cash box for today
  const TODAY_LIMA = toLimaBusinessDate(new Date());
  void cashBoxRepo.save(
    new CashBox({
      id: CashBoxId.generate(),
      businessDate: TODAY_LIMA,
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: 0,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    }),
  );

  const scope: FullFlowScope = {
    sales: saleRepo, inventoryLots: lotRepo,
    cashLedger: cashRepo, purchases: purchaseRepo,
    cashBoxes: cashBoxRepo,
  };
  const uow = new FakeUoW(scope);

  // Auth
  const userRepo = new FakeUserRepo();
  userRepo.setUser(new User(
    UserId.generate(), 'admin@complicidad.test',
    'hashed:password123', 'Admin', 'admin', true,
    new Date('2025-01-01'), new Date('2025-01-01'),
  ));
  const authController = new AuthController(
    new LoginUseCase(userRepo, new FakePasswordHasher(), new FakeTokenService()),
    new RegisterUserUseCase(userRepo, new FakePasswordHasher()),
  );
  const authRouter = createAuthRouter(authController);

  // Inventory
  const productRepo = new FakeProductRepo();
  const createProductUseCase = new CreateProductUseCase(productRepo, variantRepo);
  const registerPurchaseUseCase = new RegisterPurchaseUseCase(variantRepo);
  const inventoryRouter = createInventoryRouter(
    new ProductController(createProductUseCase),
    new InventoryController(registerPurchaseUseCase, uow),
  );

  // Sales
  const saleRouter = createSaleRouter(new SaleController(
    new CreateSaleUseCase(customerRepo, variantRepo, productRepo),
    new CancelSaleUseCase(),
    new ReturnFullSaleUseCase(),
    uow,
  ));

  // Reports — use REAL use cases backed by FakeReportRepo
  const reportRepo = new FakeReportRepo(cashRepo, lotRepo, saleRepo);
  const cashClosingRepo = new FakeCashClosingRepo();
  const reportRouter = createReportRouter(new ReportController(
    new GetLiquidityUseCase(reportRepo),
    new GetStockInvestmentUseCase(reportRepo),
    new GetSalesTotalUseCase(reportRepo),
    new GetFifoCostsUseCase(reportRepo),
    new GetGrossProfitUseCase(reportRepo),
    new GetReinvestmentUseCase(reportRepo),
    new GetOperatingCapitalUseCase(reportRepo),
    new GetStockByProductUseCase(reportRepo),
    new GetLotsUseCase(reportRepo),
    new ManualCashCloseUseCase(reportRepo, cashClosingRepo),
  ));

  const app = express();
  app.use(json());
  app.use('/auth', authRouter);
  app.use(inventoryRouter);
  app.use(saleRouter);
  app.use(reportRouter);
  app.use(errorMiddleware);

  return { customerRepo, variantRepo, lotRepo, saleRepo, cashRepo, purchaseRepo, productRepo, reportRepo, app };
}

// ── Tests ──────────────────────────────────────────────────────

describe('Full-flow E2E: login → purchase → sale → return → reports', () => {
  let infra: TestInfra;
  let app: Express;

  beforeAll(() => {
    infra = createTestApp();
    app = infra.app;
  });

  it('should complete the full flow end-to-end', async () => {
    const { customerRepo, variantRepo, lotRepo, saleRepo, cashRepo, productRepo } = infra;

    // ── Step 1: Login ─────────────────────────────────────────
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@complicidad.test', password: 'password123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();

    // ── Step 2: Set up customers ──────────────────────────────
    const customer = createTestCustomer('e2e-customer-1');
    customerRepo.customers.set(customer.id.toString(), customer);

    // ── Step 3: Set up variants ───────────────────────────────
    const variant1 = createTestVariant('e2e-v1', 'prod-a', 'e2e-prod-1');
    const variant2 = createTestVariant('e2e-v2', 'prod-b', 'e2e-prod-2');
    // Products must exist with sale prices
    const product1 = createTestProduct('e2e-prod-1', 2000);
    const product2 = createTestProduct('e2e-prod-2', 5000);
    variantRepo.setVariant(variant1);
    variantRepo.setVariant(variant2);
    await productRepo.save(product1);
    await productRepo.save(product2);

    // ── Step 4: Register purchases (create FIFO lots) ────────
    const p1Res = await request(app)
      .post('/purchases')
      .send({
        items: [{ variantId: 'e2e-v1', quantity: 10, unitCost: 5.00 }],
        notes: 'Initial stock',
      });
    expect(p1Res.status).toBe(201);
    expect(p1Res.body.lots).toHaveLength(1);
    expect(p1Res.body.lots[0]!.lotId).toBeDefined();
    const lot1Id = p1Res.body.lots[0]!.lotId as string;

    const p2Res = await request(app)
      .post('/purchases')
      .send({
        items: [{ variantId: 'e2e-v2', quantity: 5, unitCost: 12.00 }],
      });
    expect(p2Res.status).toBe(201);

    // Verify lots created and cash entries recorded
    expect(lotRepo.lots.size).toBe(2);
    expect(cashRepo.entries.length).toBe(2);
    expect(cashRepo.entries.every((e) => e.type === 'PURCHASE_OUTFLOW')).toBe(true);
    expect(cashRepo.entries.every((e) => e.amount.cents < 0)).toBe(true);

    // Cash: -(10*500) + -(5*1200) = -11000
    const totalOutflow = cashRepo.entries.reduce((s, e) => s + e.amount.cents, 0);
    expect(totalOutflow).toBe(-11000);

    // ── Step 5: Multi-item sale ───────────────────────────────
    const saleRes = await request(app)
      .post('/sales')
      .send({
        customerId: 'e2e-customer-1',
        channel: 'web',
        channelReference: 'shopify-order-999',
        items: [
          { variantId: 'e2e-v1', quantity: 3, priceType: 'regular' },
          { variantId: 'e2e-v2', quantity: 2, priceType: 'regular' },
        ],
      });
    expect(saleRes.status).toBe(201);
    expect(saleRes.body.saleId).toBeDefined();
    // Revenue: 3*20 + 2*50 = 160 (soles)
    expect(saleRes.body.totalRevenue).toBe(160);
    // Cost: 3*5 + 2*12 = 39 (soles)
    expect(saleRes.body.totalCost).toBe(39);
    // Profit: 160 - 39 = 121 (soles)
    expect(saleRes.body.grossProfit).toBe(121);
    const saleId = saleRes.body.saleId as string;

    // Verify lots consumed
    const lot1 = lotRepo.lots.get(lot1Id);
    expect(lot1?.remainingQuantity).toBe(7); // 10 - 3

    // Verify cash entry for sale income (16000 cents from sale)
    const saleCashEntries = cashRepo.entries.filter((e) => e.type === 'SALE_INCOME');
    expect(saleCashEntries).toHaveLength(1);
    expect(saleCashEntries[0]!.amount.cents).toBe(16000);

    // Cash now: -11000 + 16000 = 5000 cents
    expect(cashRepo.entries.reduce((s, e) => s + e.amount.cents, 0)).toBe(5000);

    // ── Step 6: Verify reports before return ──────────────────
    const liqRes = await request(app).get('/reports/liquidity');
    expect(liqRes.status).toBe(200);
    expect(liqRes.body.liquidityCents).toBe(5000);

    const salesRes = await request(app).get('/reports/sales-total');
    expect(salesRes.status).toBe(200);
    expect(salesRes.body.salesIncomeCents).toBe(16000);

    const cogsRes = await request(app).get('/reports/fifo-cogs');
    expect(cogsRes.status).toBe(200);
    expect(cogsRes.body.fifoCostsCents).toBe(3900);

    // Stock investment = 7*500 + 3*1200 = 3500 + 3600 = 7100
    const stockRes = await request(app).get('/reports/stock-investment');
    expect(stockRes.status).toBe(200);
    expect(stockRes.body.stockInvestmentCents).toBe(7100);

    // Gross profit = 16000 - 3900 = 12100
    const profitRes = await request(app).get('/reports/gross-profit');
    expect(profitRes.status).toBe(200);
    expect(profitRes.body.grossProfitCents).toBe(12100);

    // Reinvestment = 10*500 + 5*1200 = 11000
    const reinvRes = await request(app).get('/reports/reinvestment');
    expect(reinvRes.status).toBe(200);
    expect(reinvRes.body.reinvestmentCents).toBe(11000);

    // Operating capital = 5000 + 7100 = 12100
    const opCapRes = await request(app).get('/reports/operating-capital');
    expect(opCapRes.status).toBe(200);
    expect(opCapRes.body.operatingCapitalCents).toBe(12100);

    // ── Step 7: Return the full sale ──────────────────────────
    const returnRes = await request(app).post(`/sales/${saleId}/return`);
    expect(returnRes.status).toBe(200);

    // Verify sale status changed
    const returnedSale = saleRepo.sales.get(saleId);
    expect(returnedSale?.status).toBe('RETURNED');

    // Verify lots restored
    expect(lotRepo.lots.get(lot1Id)?.remainingQuantity).toBe(10); // back to original

    // Verify cash entry for return outflow (negative — cash leaving)
    const returnEntries = cashRepo.entries.filter((e) => e.type === 'RETURN_OUTFLOW');
    expect(returnEntries).toHaveLength(1);
    expect(returnEntries[0]!.amount.cents).toBe(-16000);

    // Cash now: -11000 + 16000 + (-16000) = -11000
    expect(cashRepo.entries.reduce((s, e) => s + e.amount.cents, 0)).toBe(-11000);

    // ── Step 8: Verify reports after return ───────────────────
    const salesAfterRes = await request(app).get('/reports/sales-total');
    expect(salesAfterRes.status).toBe(200);
    expect(salesAfterRes.body.salesIncomeCents).toBe(0);

    const cogsAfterRes = await request(app).get('/reports/fifo-cogs');
    expect(cogsAfterRes.status).toBe(200);
    expect(cogsAfterRes.body.fifoCostsCents).toBe(0);

    // Stock investment = 10*500 + 5*1200 = 11000
    const stockAfterRes = await request(app).get('/reports/stock-investment');
    expect(stockAfterRes.status).toBe(200);
    expect(stockAfterRes.body.stockInvestmentCents).toBe(11000);
  });

  it('should return 404 for sale with missing customer', async () => {
    const res = await request(app)
      .post('/sales')
      .send({
        customerId: 'nonexistent',
        channel: 'web',
        channelReference: 'test',
        items: [{ variantId: 'e2e-v1', quantity: 1, priceType: 'regular' }],
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
  });

  it('should return 404 for purchase with invalid variant', async () => {
    const res = await request(app)
      .post('/purchases')
      .send({
        items: [{ variantId: 'nonexistent', quantity: 5, unitCost: 1.00 }],
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
  });

  it('should return 400 for sale with validation errors', async () => {
    const res = await request(app)
      .post('/sales')
      .send({ customerId: 'e2e-customer-1', channel: 'web', channelReference: '', items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('should return 400 for invalid sale channel', async () => {
    const res = await request(app)
      .post('/sales')
      .send({
        customerId: 'e2e-customer-1',
        channel: 'shopify-order-456',
        channelReference: 'external-ref',
        items: [{ variantId: 'e2e-v1', quantity: 1, priceType: 'regular' }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.message).toContain('channel inválido');
  });
});
