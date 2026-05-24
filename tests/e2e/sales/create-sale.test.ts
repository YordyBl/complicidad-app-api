/**
 * E2E tests for POST /api/v1/sales — upfront payment variants.
 *
 * Verifies:
 * - amountPaidNowCents: 0 → paymentStatus "pending", no cash entry
 * - amountPaidNowCents > 0 but < total → paymentStatus "partial"
 * - amountPaidNowCents equals total → paymentStatus "paid" (full payment)
 * - amountPaidNowCents omitted → backward-compatible default = fully paid
 * - amountPaidNowCents negative → 400 validation error
 * - amountPaidNowCents exceeds total → 400
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { json, type Express } from 'express';
import { errorMiddleware } from '../../../src/infrastructure/http/index.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { CustomerRepository } from '../../../src/modules/customers/domain/CustomerRepository.js';
import type { VariantRepository } from '../../../src/modules/inventory/domain/VariantRepository.js';
import type { ProductRepository } from '../../../src/modules/inventory/domain/ProductRepository.js';
import type { InventoryLotRepository } from '../../../src/modules/inventory/domain/InventoryLotRepository.js';
import type { CashLedgerRepository } from '../../../src/modules/accounting-reports/domain/CashLedgerRepository.js';
import type { CashBoxRepository } from '../../../src/modules/accounting-reports/domain/CashBoxRepository.js';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { SaleListItemReadRepository } from '../../../src/modules/sales-returns/application/ports/SaleListItemReadRepository.js';
import type { SaleListReadRepository } from '../../../src/modules/sales-returns/application/ports/SaleListReadRepository.js';
import type { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import type { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import type { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import type { Variant } from '../../../src/modules/inventory/domain/Variant.js';
import type { Product } from '../../../src/modules/inventory/domain/Product.js';
import type { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import type { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import type { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import type { Sku } from '../../../src/modules/inventory/domain/Sku.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { toLimaBusinessDate } from '../../../src/modules/accounting-reports/domain/LimaBusinessDate.js';
import { Customer } from '../../../src/modules/customers/domain/Customer.js';
import { CustomerId } from '../../../src/modules/customers/domain/CustomerId.js';
import { Variant as VariantEntity } from '../../../src/modules/inventory/domain/Variant.js';
import { VariantId as VariantIdEntity } from '../../../src/modules/inventory/domain/VariantId.js';
import { Product as ProductEntity } from '../../../src/modules/inventory/domain/Product.js';
import { ProductId as ProductIdEntity } from '../../../src/modules/inventory/domain/ProductId.js';
import { Sku as SkuEntity } from '../../../src/modules/inventory/domain/Sku.js';
import { PurchaseLot as PurchaseLotEntity } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import { PurchaseLotId as PurchaseLotIdEntity } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { PurchaseId as PurchaseIdEntity } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId as SaleIdEntity } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { CreateSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/CreateSaleUseCase.js';
import { CancelSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/CancelSaleUseCase.js';
import { ReturnFullSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/ReturnFullSaleUseCase.js';
import { SettleSaleBalanceUseCase } from '../../../src/modules/sales-returns/application/use-cases/SettleSaleBalanceUseCase.js';
import { SaleController } from '../../../src/modules/sales-returns/interfaces/http/SaleController.js';
import { createSaleRouter } from '../../../src/modules/sales-returns/interfaces/http/sale-routes.js';
import { ListSalesUseCase } from '../../../src/modules/sales-returns/application/use-cases/ListSalesUseCase.js';

// ── Scope type ───────────────────────────────────────────────

interface SaleTestScope extends UnitOfWorkScope {
  sales: SaleRepository;
  inventoryLots: InventoryLotRepository;
  cashLedger: CashLedgerRepository;
  cashBoxes: CashBoxRepository;
}

// ── Fakes ────────────────────────────────────────────────────

class FakeCustomerRepository implements CustomerRepository {
  private customers = new Map<string, Customer>();

  setCustomer(c: Customer): void {
    this.customers.set(c.id.toString(), c);
  }

  async findById(id: CustomerId): Promise<Customer | null> {
    return this.customers.get(id.toString()) ?? null;
  }

  async save(customer: Customer): Promise<void> {
    this.customers.set(customer.id.toString(), customer);
  }

  async findAll(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }
}

class FakeVariantRepository implements VariantRepository {
  private variants = new Map<string, Variant>();

  setVariant(v: Variant): void {
    this.variants.set(v.id.toString(), v);
  }

  async findById(id: VariantId): Promise<Variant | null> {
    return this.variants.get(id.toString()) ?? null;
  }

  async findBySku(sku: Sku): Promise<Variant | null> {
    for (const v of this.variants.values()) {
      if (v.sku.equals(sku)) return v;
    }
    return null;
  }

  async findByProductId(productId: ProductId): Promise<Variant[]> {
    return Array.from(this.variants.values()).filter((v) => v.productId.equals(productId));
  }

  async save(variant: Variant): Promise<void> {
    this.variants.set(variant.id.toString(), variant);
  }

  async delete(id: VariantId): Promise<void> {
    this.variants.delete(id.toString());
  }
}

class FakeProductRepository implements ProductRepository {
  private products = new Map<string, Product>();

  setProduct(p: Product): void {
    this.products.set(p.id.toString(), p);
  }

  async findById(id: ProductId): Promise<Product | null> {
    return this.products.get(id.toString()) ?? null;
  }

  async findByAlias(_alias: string): Promise<Product[]> {
    return [];
  }

  async save(product: Product): Promise<void> {
    this.products.set(product.id.toString(), product);
  }

  async delete(_id: ProductId): Promise<void> {
    // no-op
  }

  async findAllActive(): Promise<Product[]> {
    return Array.from(this.products.values()).filter((p) => p.isActive);
  }
}

class FakeInventoryLotRepository implements InventoryLotRepository {
  lots = new Map<string, PurchaseLot>();

  async findById(id: PurchaseLotId): Promise<PurchaseLot | null> {
    return this.lots.get(id.toString()) ?? null;
  }

  async findByIds(ids: PurchaseLotId[]): Promise<PurchaseLot[]> {
    return ids
      .map((id) => this.lots.get(id.toString()))
      .filter((l): l is PurchaseLot => l !== undefined);
  }

  async findByVariantIdOrderedByDate(variantId: VariantId, _lock?: boolean): Promise<PurchaseLot[]> {
    return Array.from(this.lots.values())
      .filter((l) => l.variantId.equals(variantId))
      .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());
  }

  async save(lot: PurchaseLot): Promise<void> {
    this.lots.set(lot.id.toString(), lot);
  }

  async saveMany(lots: PurchaseLot[]): Promise<void> {
    for (const lot of lots) {
      this.lots.set(lot.id.toString(), lot);
    }
  }

  async delete(id: PurchaseLotId): Promise<void> {
    this.lots.delete(id.toString());
  }

  async findByIdForUpdate(id: PurchaseLotId): Promise<PurchaseLot | null> {
    return this.lots.get(id.toString()) ?? null;
  }

  async hasConsumptionRecords(): Promise<boolean> { return false; }
}

class FakeSaleRepository implements SaleRepository {
  sales = new Map<string, SaleEntity>();

  async save(sale: SaleEntity): Promise<void> {
    this.sales.set(sale.id.toString(), sale);
  }

  async findById(id: SaleIdEntity): Promise<SaleEntity | null> {
    return this.sales.get(id.toString()) ?? null;
  }

  async findByCustomerId(customerId: string): Promise<SaleEntity[]> {
    return Array.from(this.sales.values())
      .filter((s) => s.customerId === customerId)
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

class FakeCashLedgerRepository implements CashLedgerRepository {
  entries: CashLedgerEntry[] = [];

  async append(entry: CashLedgerEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findAllOrdered(): Promise<CashLedgerEntry[]> {
    return [...this.entries];
  }

  async findById(id: CashLedgerEntryId): Promise<CashLedgerEntry | null> {
    return this.entries.find((e) => e.id.toString() === id.toString()) ?? null;
  }

  async findByCashBoxId(cashBoxId: string): Promise<CashLedgerEntry[]> {
    return this.entries.filter((e) => e.cashBoxId?.toString() === cashBoxId);
  }
}

class FakeCashBoxRepository implements CashBoxRepository {
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

class FakeUnitOfWork implements UnitOfWork {
  scope: SaleTestScope;

  constructor(
    sales: SaleRepository,
    inventoryLots: InventoryLotRepository,
    cashLedger: CashLedgerRepository,
    cashBoxes: CashBoxRepository,
  ) {
    this.scope = { sales, inventoryLots, cashLedger, cashBoxes };
  }

  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    return fn(this.scope);
  }
}

class FakeSaleListItemRepo implements SaleListItemReadRepository {
  async findBySaleIds(): Promise<[]> { return []; }
}

class FakeSaleListReadRepo implements SaleListReadRepository {
  async query(): Promise<{ items: []; total: number; page: number; pageSize: number; totalPages: number }> {
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  }
}

// ── Fixtures ─────────────────────────────────────────────────

function createTestCustomer(id?: string): Customer {
  return new Customer(
    CustomerId.from(id ?? 'customer-1'),
    'Test Customer',
    'test@example.com',
    '+1234567890',
    null, null, null, null, null,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  );
}

function createTestVariant(id?: string, productId?: string): VariantEntity {
  const skuResult = SkuEntity.from('test-' + (id ?? 'v1'));
  if (!skuResult.ok) throw new Error('Invalid SKU');
  return new VariantEntity(
    VariantIdEntity.from(id ?? 'v1'),
    ProductIdEntity.from(productId ?? 'prod-1'),
    skuResult.value,
    {},
    true,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  );
}

function createTestProduct(id?: string, salePriceCents?: number): ProductEntity {
  return new ProductEntity(
    ProductIdEntity.from(id ?? 'prod-1'),
    'Test Product',
    null,
    'test-product',
    Money.fromCents(salePriceCents ?? 2000),
    null,
    [],
    true,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  );
}

function createTestLot(
  id: string,
  variantId: string,
  qty: number,
  unitCostCents: number,
  date: Date,
): PurchaseLotEntity {
  return new PurchaseLotEntity(
    PurchaseLotIdEntity.from(id),
    VariantIdEntity.from(variantId),
    PurchaseIdEntity.generate(),
    qty,
    qty,
    Money.fromCents(unitCostCents),
    date,
    null,
  );
}

// ── Test app factory ─────────────────────────────────────────

interface TestApp {
  app: Express;
  saleRepo: FakeSaleRepository;
  cashRepo: FakeCashLedgerRepository;
}

const TODAY_LIMA = toLimaBusinessDate(new Date());

function createApp(): TestApp {
  const customerRepo = new FakeCustomerRepository();
  customerRepo.setCustomer(createTestCustomer('customer-1'));

  const variantRepo = new FakeVariantRepository();
  const productRepo = new FakeProductRepository();
  variantRepo.setVariant(createTestVariant('v1', 'prod-1'));
  productRepo.setProduct(createTestProduct('prod-1', 2000));

  const lotRepo = new FakeInventoryLotRepository();
  lotRepo.lots.set('lot-v1', createTestLot('lot-v1', 'v1', 10, 500, new Date('2026-01-01')));

  const saleRepo = new FakeSaleRepository();
  const cashRepo = new FakeCashLedgerRepository();
  const cashBoxRepo = new FakeCashBoxRepository();

  // Ensure open cash box for today
  const boxId = CashBoxId.generate();
  void cashBoxRepo.save(
    new CashBox({
      id: boxId,
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

  const createSaleUseCase = new CreateSaleUseCase(customerRepo, variantRepo, productRepo);
  const cancelSaleUseCase = new CancelSaleUseCase();
  const returnFullSaleUseCase = new ReturnFullSaleUseCase();
  const settleSaleBalanceUseCase = new SettleSaleBalanceUseCase();
  const itemRepo = new FakeSaleListItemRepo();
  const listRepo = new FakeSaleListReadRepo();
  const listSalesUseCase = new ListSalesUseCase(saleRepo, itemRepo, listRepo);
  const uow = new FakeUnitOfWork(saleRepo, lotRepo, cashRepo, cashBoxRepo);

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

  return { app, saleRepo, cashRepo };
}

// ── Tests ────────────────────────────────────────────────────

describe('POST /api/v1/sales — upfront payment variants', () => {
  let infra: TestApp;
  let app: Express;

  beforeEach(() => {
    infra = createApp();
    app = infra.app;
  });

  const validBody = {
    customerId: 'customer-1',
    channel: 'web',
    items: [
      { variantId: 'v1', quantity: 2, priceType: 'regular' },
    ],
  };

  describe('amountPaidNowCents forwarding', () => {
    it('zero upfront payment: amountPaidNowCents=0 should produce paymentStatus=pending', async () => {
      const res = await request(app)
        .post('/api/v1/sales')
        .send({ ...validBody, amountPaidNowCents: 0 })
        .expect(201);

      expect(res.body.saleId).toBeDefined();
      // Check persisted sale state via repository
      const sale = infra.saleRepo.sales.get(res.body.saleId);
      expect(sale).toBeDefined();
      expect(sale!.paymentStatus).toBe('pending');
      expect(sale!.amountPaid.cents).toBe(0);
      expect(sale!.pendingBalance.cents).toBe(4000); // 2 * 2000
      // No cash entry for zero payment
      expect(infra.cashRepo.entries).toHaveLength(0);
    });

    it('partial upfront payment: amountPaidNowCents less than total → paymentStatus=partial', async () => {
      const res = await request(app)
        .post('/api/v1/sales')
        .send({ ...validBody, amountPaidNowCents: 2000 })
        .expect(201);

      const sale = infra.saleRepo.sales.get(res.body.saleId);
      expect(sale).toBeDefined();
      expect(sale!.paymentStatus).toBe('partial');
      expect(sale!.amountPaid.cents).toBe(2000);
      expect(sale!.pendingBalance.cents).toBe(2000); // 4000 - 2000
      // Cash entry only for 2000
      expect(infra.cashRepo.entries).toHaveLength(1);
      expect(infra.cashRepo.entries[0]!.amount.cents).toBe(2000);
    });

    it('full upfront payment: amountPaidNowCents equals total → paymentStatus=paid', async () => {
      const res = await request(app)
        .post('/api/v1/sales')
        .send({ ...validBody, amountPaidNowCents: 4000 })
        .expect(201);

      const sale = infra.saleRepo.sales.get(res.body.saleId);
      expect(sale).toBeDefined();
      expect(sale!.paymentStatus).toBe('paid');
      expect(sale!.amountPaid.cents).toBe(4000);
      expect(sale!.pendingBalance.cents).toBe(0);
      expect(infra.cashRepo.entries).toHaveLength(1);
      expect(infra.cashRepo.entries[0]!.amount.cents).toBe(4000);
    });

    it('backward compatible: omitting amountPaidNowCents defaults to fully paid', async () => {
      const res = await request(app)
        .post('/api/v1/sales')
        .send({ ...validBody })
        .expect(201);

      const sale = infra.saleRepo.sales.get(res.body.saleId);
      expect(sale).toBeDefined();
      expect(sale!.paymentStatus).toBe('paid');
      expect(sale!.amountPaid.cents).toBe(4000);
      expect(sale!.pendingBalance.cents).toBe(0);
    });

    it('rejects negative amountPaidNowCents', async () => {
      const res = await request(app)
        .post('/api/v1/sales')
        .send({ ...validBody, amountPaidNowCents: -100 })
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.message).toContain('monto pagado no puede ser negativo');
    });

    it('rejects amountPaidNowCents exceeding total', async () => {
      const res = await request(app)
        .post('/api/v1/sales')
        .send({ ...validBody, amountPaidNowCents: 99999 })
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.message).toContain('monto pagado');
    });
  });
});
