/**
 * Application tests for CreateSaleUseCase.
 *
 * Tests the full use case with fake repositories. Verifies:
 * - Multi-item sale creates sale, lines, consumptions, cash entry
 * - FIFO lot allocation across multiple lots
 * - Insufficient stock rollback
 * - Required customer validation
 * - Required channel reference validation
 * - Cash ledger entry creation for sales income
 * - Exact profit calculations
 * - Closed SaleChannel catalog validation
 * - Integer quantity validation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CreateSaleUseCase, InvalidChannelError, InvalidQuantityError } from '../../../src/modules/sales-returns/application/use-cases/CreateSaleUseCase.js';
import type { CreateSaleCommand } from '../../../src/modules/sales-returns/application/use-cases/CreateSaleUseCase.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { CustomerRepository } from '../../../src/modules/customers/domain/CustomerRepository.js';
import type { VariantRepository } from '../../../src/modules/inventory/domain/VariantRepository.js';
import type { ProductRepository } from '../../../src/modules/inventory/domain/ProductRepository.js';
import type { InventoryLotRepository } from '../../../src/modules/inventory/domain/InventoryLotRepository.js';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { CashLedgerRepository } from '../../../src/modules/accounting-reports/domain/CashLedgerRepository.js';
import type { CashBoxRepository } from '../../../src/modules/accounting-reports/domain/CashBoxRepository.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { toLimaBusinessDate } from '../../../src/modules/accounting-reports/domain/LimaBusinessDate.js';
import type { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import type { Variant } from '../../../src/modules/inventory/domain/Variant.js';
import type { Product } from '../../../src/modules/inventory/domain/Product.js';
import type { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import type { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import type { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import type { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import type { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import type { Sku } from '../../../src/modules/inventory/domain/Sku.js';
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
import { NotFoundError, BusinessRuleError } from '../../../src/shared/domain/errors.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId as SaleIdEntity } from '../../../src/modules/sales-returns/domain/SaleId.js';

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

// ── Fixtures ─────────────────────────────────────────────────

function createTestCustomer(id?: string): Customer {
  return new Customer(
    CustomerId.from(id ?? 'customer-1'),
    'Test Customer',
    'test@example.com',
    '+1234567890',
    null, null, null, null,
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

function createTestProduct(id?: string, salePriceCents?: number, presalePriceCents?: number | null): ProductEntity {
  return new ProductEntity(
    ProductIdEntity.from(id ?? 'prod-1'),
    'Test Product',
    null,
    'test-product',
    Money.fromCents(salePriceCents ?? 2000),
    presalePriceCents !== undefined && presalePriceCents !== null ? Money.fromCents(presalePriceCents) : null,
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

// ── Tests ────────────────────────────────────────────────────

describe('CreateSaleUseCase', () => {
  let customerRepo: FakeCustomerRepository;
  let variantRepo: FakeVariantRepository;
  let productRepo: FakeProductRepository;
  let lotRepo: FakeInventoryLotRepository;
  let saleRepo: FakeSaleRepository;
  let cashRepo: FakeCashLedgerRepository;
  let cashBoxRepo: FakeCashBoxRepository;
  let useCase: CreateSaleUseCase;
  let customer: Customer;
  let variant1: VariantEntity;
  let variant2: VariantEntity;
  let product1: ProductEntity;
  let product2: ProductEntity;
  let currentCashBoxId: string;

  const TODAY_LIMA = toLimaBusinessDate(new Date());

  function ensureOpenCashBox(): string {
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
    return boxId.toString();
  }

  beforeEach(() => {
    customer = createTestCustomer();
    product1 = createTestProduct('prod-1', 2000);
    product2 = createTestProduct('prod-2', 5000);
    variant1 = createTestVariant('v1', 'prod-1');
    variant2 = createTestVariant('v2', 'prod-2');

    customerRepo = new FakeCustomerRepository();
    customerRepo.setCustomer(customer);

    variantRepo = new FakeVariantRepository();
    variantRepo.setVariant(variant1);
    variantRepo.setVariant(variant2);

    productRepo = new FakeProductRepository();
    productRepo.setProduct(product1);
    productRepo.setProduct(product2);

    lotRepo = new FakeInventoryLotRepository();
    saleRepo = new FakeSaleRepository();
    cashRepo = new FakeCashLedgerRepository();
    cashBoxRepo = new FakeCashBoxRepository();
    currentCashBoxId = ensureOpenCashBox();

    useCase = new CreateSaleUseCase(customerRepo, variantRepo, productRepo);
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork(saleRepo, lotRepo, cashRepo, cashBoxRepo);
  }

  // ── Open caja enforcement ───────────────────────────────────

  describe('open caja enforcement', () => {
    it('rejects sale when no cash box is open for today', async () => {
      // Use an empty cash box repo — no box at all
      const emptyBoxRepo = new FakeCashBoxRepository();
      const uow = new FakeUnitOfWork(saleRepo, lotRepo, cashRepo, emptyBoxRepo);

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        items: [
          { variantId: 'v1', quantity: 1, priceType: 'regular' },
        ],
      };

      const result = await useCase.execute(command, uow);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('caja abierta');
      expect(cashRepo.entries).toHaveLength(0);
    });

    it('rejects sale when today cash box is closed', async () => {
      // Set up a CLOSED box for today using a dedicated fake
      const closedBox = new CashBox({
        id: CashBoxId.generate(),
        businessDate: TODAY_LIMA,
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 0,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date(),
      });
      const closed = closedBox.close(0);
      const closedBoxRepo = new FakeCashBoxRepository();
      // Override findByBusinessDate to return the closed box
      closedBoxRepo.findByBusinessDate = async () => closed;
      const uow = new FakeUnitOfWork(saleRepo, lotRepo, cashRepo, closedBoxRepo);

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        items: [
          { variantId: 'v1', quantity: 1, priceType: 'regular' },
        ],
      };

      const result = await useCase.execute(command, uow);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(cashRepo.entries).toHaveLength(0);
    });
  });

  // ── Valid multi-item sale ──────────────────────────────────

  describe('valid multi-item sale', () => {
    it('creates sale with lines, consumptions, and cash entry', async () => {
      // One lot for v1 with enough stock
      lotRepo.lots.set('lot-v1', createTestLot('lot-v1', 'v1', 10, 500, new Date('2026-01-01')));
      // One lot for v2 with enough stock
      lotRepo.lots.set('lot-v2', createTestLot('lot-v2', 'v2', 5, 1200, new Date('2026-01-02')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'shopify-order-456',
        items: [
          { variantId: 'v1', quantity: 3, priceType: 'regular' },
          { variantId: 'v2', quantity: 2, priceType: 'regular' },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Verify response totals
      // Revenue: 3*2000 + 2*5000 = 6000 + 10000 = 16000 (from product sale prices)
      expect(result.value.totalRevenue).toBe(160);
      // Cost: 3*500 + 2*1200 = 1500 + 2400 = 3900
      expect(result.value.totalCost).toBe(39);
      // Profit: 16000 - 3900 = 12100
      expect(result.value.grossProfit).toBe(121);
      expect(result.value.saleId).toBeDefined();

      // Verify sale was persisted
      expect(saleRepo.sales.size).toBe(1);

      // Verify lots were consumed
      const lot1 = lotRepo.lots.get('lot-v1');
      expect(lot1?.remainingQuantity).toBe(7); // 10 - 3

      const lot2 = lotRepo.lots.get('lot-v2');
      expect(lot2?.remainingQuantity).toBe(3); // 5 - 2

      // Verify cash ledger entry (positive SALE_INCOME, scoped to cash box)
      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.type).toBe('SALE_INCOME');
      expect(cashRepo.entries[0]!.amount.cents).toBe(16000);
      expect(cashRepo.entries[0]!.sourceId).toBe(result.value.saleId);
      expect(cashRepo.entries[0]!.concept).toBe('Prenda vendida');
      expect(cashRepo.entries[0]!.cashBoxId?.toString()).toBe(currentCashBoxId);
    });
  });

  // ── FIFO allocation across multiple lots ───────────────────

  describe('FIFO lot allocation across multiple lots', () => {
    it('consumes from oldest lot first when multiple lots exist', async () => {
      // Two lots for the same variant: oldest has cheaper cost
      lotRepo.lots.set('lot-old', createTestLot('lot-old', 'v1', 5, 200, new Date('2026-01-01')));
      lotRepo.lots.set('lot-new', createTestLot('lot-new', 'v1', 5, 500, new Date('2026-01-10')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 7, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should consume 5 from old lot (200 each) + 2 from new lot (500 each)
      // Cost: 5*200 + 2*500 = 1000 + 1000 = 2000
      // Revenue: 7 * 2000 (product sale price) = 14000
      expect(result.value.totalCost).toBe(20);
      expect(result.value.totalRevenue).toBe(140);
      expect(result.value.grossProfit).toBe(120);

      // Verify remaining quantities
      const oldLot = lotRepo.lots.get('lot-old');
      expect(oldLot?.remainingQuantity).toBe(0); // exhausted

      const newLot = lotRepo.lots.get('lot-new');
      expect(newLot?.remainingQuantity).toBe(3); // 5 - 2
    });
  });

  // ── Insufficient stock ─────────────────────────────────────

  describe('insufficient stock', () => {
    it('rejects sale when variant has insufficient stock', async () => {
      lotRepo.lots.set('lot-small', createTestLot('lot-small', 'v1', 3, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 10, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('Stock insuficiente');
    });

    it('rejects sale when variant has no lots at all', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 1, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('Stock insuficiente');
    });
  });

  // ── Required customer ──────────────────────────────────────

  describe('required customer', () => {
    it('rejects sale with unknown customer', async () => {
      const command: CreateSaleCommand = {
        customerId: 'non-existent-customer',
        channel: 'web',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 1, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(result.error.message).toContain('Customer');
    });
  });

  // ── Optional channel reference ─────────────────────────────

  describe('optional channel reference', () => {
    it('accepts sale without channelReference', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        items: [{ variantId: 'v1', quantity: 1, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Verify sale was persisted (channelReference omitted)
      expect(saleRepo.sales.size).toBe(1);
      const persistedSale = Array.from(saleRepo.sales.values())[0]!;
      expect(persistedSale.channelReference).toBeUndefined();
      expect(persistedSale.channel).toBe('web');
    });

    it('still accepts sale with channelReference for backward compatibility', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'shopify-order-789',
        items: [{ variantId: 'v1', quantity: 1, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const persistedSale = Array.from(saleRepo.sales.values())[0]!;
      expect(persistedSale.channelReference).toBe('shopify-order-789');
    });
  });

  // ── SaleChannel catalog validation ─────────────────────────

  describe('SaleChannel catalog validation', () => {
    it('accepts all valid SaleChannel values', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const channels: CreateSaleCommand['channel'][] = ['tiktok', 'facebook', 'whatsapp', 'web', 'instagram'];
      for (const channel of channels) {
        const command: CreateSaleCommand = {
          customerId: 'customer-1',
          channel,
          channelReference: `${channel}-order`,
          items: [{ variantId: 'v1', quantity: 1, priceType: 'regular' }],
        };

        const result = await useCase.execute(command, createUow());
        expect(result.ok).toBe(true);
      }

      // 5 sales created, one per channel
      expect(saleRepo.sales.size).toBe(5);
      expect(cashRepo.entries).toHaveLength(5);
    });

    it('rejects sale with invalid channel', async () => {
      const command = {
        customerId: 'customer-1',
        channel: 'shopify-order-456',
        channelReference: 'some-ref',
        items: [{ variantId: 'v1', quantity: 1, priceType: 'regular' }],
      } as unknown as CreateSaleCommand;

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidChannelError);
      expect(result.error.message).toContain('shopify-order-456');
    });

    it('rejects sale with empty channel', async () => {
      const command = {
        customerId: 'customer-1',
        channel: '',
        channelReference: 'some-ref',
        items: [{ variantId: 'v1', quantity: 1, priceType: 'regular' }],
      } as unknown as CreateSaleCommand;

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidChannelError);
    });
  });

  // ── Integer quantity validation ────────────────────────────

  describe('integer quantity validation', () => {
    it('rejects sale with fractional quantity', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 1.5, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
      expect(result.error.message).toContain('entero');
    });

    it('rejects sale with non-integer quantity (3.0 is accepted as integer in JS)', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 3.0, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      // 3.0 is integer in JS (Number.isInteger(3.0) === true)
      expect(result.ok).toBe(true);
    });
  });

  // ── Cash entry creation ────────────────────────────────────

  describe('cash entry creation', () => {
    it('creates positive SALE_INCOME cash entry for total revenue', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 5, 300, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'pos-terminal-001',
        items: [{ variantId: 'v1', quantity: 3, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.type).toBe('SALE_INCOME');
      expect(cashRepo.entries[0]!.amount.cents).toBe(6000); // 3*2000
      expect(cashRepo.entries[0]!.amount.isPositive()).toBe(true);
      expect(cashRepo.entries[0]!.tag).toBeNull();
      expect(cashRepo.entries[0]!.concept).toBe('Prenda vendida');
      expect(cashRepo.entries[0]!.cashBoxId?.toString()).toBe(currentCashBoxId);
    });
  });

  // ── Exact profit calculations ──────────────────────────────

  describe('exact profit calculations', () => {
    it('calculates profit from frozen costs correctly', async () => {
      // Lot purchased at 750 each
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 750, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 4, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Revenue: 4 * 2000 = 8000
      // Cost: 4 * 750 = 3000
      // Profit: 8000 - 3000 = 5000
      expect(result.value.totalRevenue).toBe(80);
      expect(result.value.totalCost).toBe(30);
      expect(result.value.grossProfit).toBe(50);
    });
  });

  // ── Transactional rollback ─────────────────────────────────

  describe('transactional integrity', () => {
    it('rejects entire transaction when any item fails, leaving no partial state', async () => {
      // Lot for variant-1 but NOT for variant-2
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'web-order',
        items: [
          { variantId: 'v1', quantity: 2, priceType: 'regular' },
          { variantId: 'v2', quantity: 5, priceType: 'regular' }, // no lots for v2
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('Stock insuficiente');

      // Verify nothing was saved
      expect(saleRepo.sales.size).toBe(0);
      expect(cashRepo.entries).toHaveLength(0);

      // Lot 1 should NOT have been consumed (rolled back)
      const lot1 = lotRepo.lots.get('lot-1');
      expect(lot1?.remainingQuantity).toBe(10);
    });
  });

  // ── Presale price resolution ──────────────────────────────

  describe('presale price resolution', () => {
    it('resolves unit price from product presalePrice when priceType is "presale"', async () => {
      // Product with salePrice=2000 ($20.00) and presalePrice=1500 ($15.00)
      const presaleProduct = createTestProduct('prod-presale', 2000, 1500);
      const presaleVariant = createTestVariant('v-presale', 'prod-presale');

      productRepo.setProduct(presaleProduct);
      variantRepo.setVariant(presaleVariant);

      lotRepo.lots.set('lot-presale', createTestLot('lot-presale', 'v-presale', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'presale-order',
        items: [{ variantId: 'v-presale', quantity: 2, priceType: 'presale' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Revenue should be 2 * presale(1500) = 3000 ($30.00)
      expect(result.value.totalRevenue).toBe(30);

      // Verify the sale line stores the correct priceType and unitPriceCents
      const sale = Array.from(saleRepo.sales.values())[0]!;
      const line = sale.lines[0]!;
      expect(line.priceType).toBe('presale');
      expect(line.unitPrice.cents).toBe(1500);

      // Cost: 2 * 500 = 1000 ($10.00)
      expect(result.value.totalCost).toBe(10);
      // Profit: 3000 - 1000 = 2000 ($20.00)
      expect(result.value.grossProfit).toBe(20);
    });

    it('falls back to salePrice when presale priceType is used but product has no presalePrice', async () => {
      // Product with salePrice=2000, no presalePrice
      const noPresaleProduct = createTestProduct('prod-no-presale', 2000, null);
      const noPresaleVariant = createTestVariant('v-no-presale', 'prod-no-presale');

      productRepo.setProduct(noPresaleProduct);
      variantRepo.setVariant(noPresaleVariant);

      lotRepo.lots.set('lot-nopre', createTestLot('lot-nopre', 'v-no-presale', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'fallback-order',
        items: [{ variantId: 'v-no-presale', quantity: 3, priceType: 'presale' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Falls back to salePrice (2000) because no presalePrice
      expect(result.value.totalRevenue).toBe(60); // 3 * 2000 = 6000

      const sale = Array.from(saleRepo.sales.values())[0]!;
      const line = sale.lines[0]!;
      // Still records priceType as 'presale' even though fallback price was used
      expect(line.priceType).toBe('presale');
      expect(line.unitPrice.cents).toBe(2000);
    });
  });

  // ── Sale snapshot immutability ──────────────────────────────

  describe('sale snapshot immutability', () => {
    it('preserves original price snapshot when product price later changes', async () => {
      // Create product with salePrice=2000 ($20.00)
      const snapProduct = createTestProduct('prod-snap', 2000, null);
      const snapVariant = createTestVariant('v-snap', 'prod-snap');

      productRepo.setProduct(snapProduct);
      variantRepo.setVariant(snapVariant);

      lotRepo.lots.set('lot-snap', createTestLot('lot-snap', 'v-snap', 10, 500, new Date('2026-01-01')));

      // Step 1: Create the sale at original price ($20.00)
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'snapshot-order',
        items: [{ variantId: 'v-snap', quantity: 2, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Verify original sale snapshot = $20.00 * 2 = $40.00
      expect(result.value.totalRevenue).toBe(40);

      // Step 2: Change the product price to $50.00 (5000 cents)
      snapProduct.changeSalePrice(Money.fromCents(5000));
      productRepo.setProduct(snapProduct); // update in fake repo

      // Step 3: Verify the stored sale still has the ORIGINAL price ($20.00)
      const storedSale = Array.from(saleRepo.sales.values())[0]!;
      const storedLine = storedSale.lines[0]!;
      expect(storedLine.unitPrice.cents).toBe(2000); // still $20.00
      expect(storedLine.priceType).toBe('regular');

      // Step 4: Create a NEW sale with the NEW price ($50.00)
      lotRepo.lots.set('lot-snap2', createTestLot('lot-snap2', 'v-snap', 10, 600, new Date('2026-02-01')));
      // Note: we restored variant lots by adding new lot, the old lot was consumed

      const command2: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'new-price-order',
        items: [{ variantId: 'v-snap', quantity: 1, priceType: 'regular' }],
      };

      const result2 = await useCase.execute(command2, createUow());

      expect(result2.ok).toBe(true);
      if (!result2.ok) return;

      // New sale uses new price ($50.00)
      expect(result2.value.totalRevenue).toBe(50);

      // Original sale STILL has old price ($20.00) — snapshot is immutable
      const allSales = Array.from(saleRepo.sales.values());
      const origSale = allSales[0]!;
      const newSale = allSales[1]!;
      expect(origSale.lines[0]!.unitPrice.cents).toBe(2000);
      expect(newSale.lines[0]!.unitPrice.cents).toBe(5000);
    });

    it('preserves presale snapshot when presale price later changes', async () => {
      // Product with presale price $15.00 (1500 cents)
      const presaleSnapProduct = createTestProduct('prod-presale-snap', 2000, 1500);
      const presaleSnapVariant = createTestVariant('v-presale-snap', 'prod-presale-snap');

      productRepo.setProduct(presaleSnapProduct);
      variantRepo.setVariant(presaleSnapVariant);

      lotRepo.lots.set('lot-ps', createTestLot('lot-ps', 'v-presale-snap', 10, 500, new Date('2026-01-01')));

      // Step 1: Create presale at $15.00
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'presale-snap-order',
        items: [{ variantId: 'v-presale-snap', quantity: 3, priceType: 'presale' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.totalRevenue).toBe(45); // 3 * 1500 = 4500

      // Step 2: Change presale price to $10.00
      presaleSnapProduct.changePresalePrice(Money.fromCents(1000));
      productRepo.setProduct(presaleSnapProduct);

      // Step 3: Verify stored presale snapshot remains $15.00
      const storedSale = Array.from(saleRepo.sales.values())[0]!;
      const storedLine = storedSale.lines[0]!;
      expect(storedLine.priceType).toBe('presale');
      expect(storedLine.unitPrice.cents).toBe(1500); // unchanged
    });
  });

  // ── Variant not found ──────────────────────────────────────

  describe('variant lookup', () => {
    it('rejects sale with unknown variant', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        channelReference: 'web-order',
        items: [{ variantId: 'non-existent-variant', quantity: 1, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(result.error.message).toContain('Variant');
    });
  });

  // ── Payment at creation ──────────────────────────────────────

  describe('payment at creation', () => {
    beforeEach(() => {
      lotRepo.lots.set('lot-v1-pay', createTestLot('lot-v1-pay', 'v1', 10, 500, new Date('2026-01-01')));
    });

    it('full payment: amountPaidNow equals total revenue → paymentStatus is paid', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        amountPaidNowCents: 6000, // 3 * 2000
        items: [{ variantId: 'v1', quantity: 3, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sale = Array.from(saleRepo.sales.values())[0]!;
      expect(sale.paymentStatus).toBe('paid');
      expect(sale.amountPaid.cents).toBe(6000);
      expect(sale.pendingBalance.cents).toBe(0);

      // Cash entry equals the collected amount
      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.amount.cents).toBe(6000);
    });

    it('zero payment: amountPaidNow is 0 → paymentStatus is pending', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        amountPaidNowCents: 0,
        items: [{ variantId: 'v1', quantity: 3, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sale = Array.from(saleRepo.sales.values())[0]!;
      expect(sale.paymentStatus).toBe('pending');
      expect(sale.amountPaid.cents).toBe(0);
      expect(sale.pendingBalance.cents).toBe(6000); // 3*2000

      // No cash entry for zero payment
      expect(cashRepo.entries).toHaveLength(0);
    });

    it('partial payment: amountPaidNow less than total → paymentStatus is partial', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        amountPaidNowCents: 2000, // only 1 of 3 items paid
        items: [{ variantId: 'v1', quantity: 3, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sale = Array.from(saleRepo.sales.values())[0]!;
      expect(sale.paymentStatus).toBe('partial');
      expect(sale.amountPaid.cents).toBe(2000);
      expect(sale.pendingBalance.cents).toBe(4000); // 3*2000 - 2000

      // Cash entry only for collected amount
      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.amount.cents).toBe(2000);
    });

    it('rejects negative amountPaidNowCents', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        amountPaidNowCents: -100,
        items: [{ variantId: 'v1', quantity: 3, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('monto pagado');
    });

    it('rejects amountPaidNowCents exceeding total revenue', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        amountPaidNowCents: 10000, // only 6000 total
        items: [{ variantId: 'v1', quantity: 3, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('monto pagado');
    });

    it('rejects non-integer amountPaidNowCents', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        amountPaidNowCents: 1.5,
        items: [{ variantId: 'v1', quantity: 3, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('entero');
    });

    it('defaults to paid when amountPaidNowCents is omitted (backward compatibility)', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channel: 'web',
        items: [{ variantId: 'v1', quantity: 3, priceType: 'regular' }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sale = Array.from(saleRepo.sales.values())[0]!;
      expect(sale.paymentStatus).toBe('paid');
      expect(sale.amountPaid.cents).toBe(6000); // defaults to total revenue
      expect(sale.pendingBalance.cents).toBe(0);

      // Cash entry for full total (backward compatible)
      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.amount.cents).toBe(6000);
    });
  });
});
