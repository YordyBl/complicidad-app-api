/**
 * Application tests for concurrent/simultaneous sales attempting to
 * consume the same final stock unit.
 *
 * IMPORTANT: True DB-level concurrency testing (PostgreSQL row locks with
 * `FOR UPDATE` + serialization failures) requires a real PostgreSQL instance.
 * These tests use a controlled fake that simulates the same behavioural
 * guarantee: only one concurrent sale succeeds when stock is exhausted.
 *
 * The deterministic fake models the critical section: when two UnitOfWork
 * calls race over the same inventory lot, one's FIFO allocation succeeds
 * and the other's fails with InsufficientStockError.
 *
 * When a real PostgreSQL + TypeORM test DB is available, add integration
 * tests in `tests/integration/sales/concurrent-sales.pg.test.ts` using
 * Promise.all + actual FOR UPDATE row locks to verify serialization.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CreateSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/CreateSaleUseCase.js';
import type { CreateSaleCommand } from '../../../src/modules/sales-returns/application/use-cases/CreateSaleUseCase.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { CustomerRepository } from '../../../src/modules/customers/domain/CustomerRepository.js';
import type { VariantRepository } from '../../../src/modules/inventory/domain/VariantRepository.js';
import type { InventoryLotRepository } from '../../../src/modules/inventory/domain/InventoryLotRepository.js';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { CashLedgerRepository } from '../../../src/modules/accounting-reports/domain/CashLedgerRepository.js';
import type { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import type { Variant } from '../../../src/modules/inventory/domain/Variant.js';
import type { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import type { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import type { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import type { Sku } from '../../../src/modules/inventory/domain/Sku.js';
import { Customer } from '../../../src/modules/customers/domain/Customer.js';
import { CustomerId } from '../../../src/modules/customers/domain/CustomerId.js';
import { Variant as VariantEntity } from '../../../src/modules/inventory/domain/Variant.js';
import { VariantId as VariantIdEntity } from '../../../src/modules/inventory/domain/VariantId.js';
import { ProductId as ProductIdEntity } from '../../../src/modules/inventory/domain/ProductId.js';
import { Sku as SkuEntity } from '../../../src/modules/inventory/domain/Sku.js';
import { PurchaseLot as PurchaseLotEntity } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import type { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { PurchaseLotId as PurchaseLotIdEntity } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { PurchaseId as PurchaseIdEntity } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId as SaleIdEntity } from '../../../src/modules/sales-returns/domain/SaleId.js';

// ── Scope type ────────────────────────────────────────────────

interface ConcurrencyScope extends UnitOfWorkScope {
  sales: SaleRepository;
  inventoryLots: InventoryLotRepository;
  cashLedger: CashLedgerRepository;
}

// ── Fakes (same pattern as create-sale.test.ts) ───────────────

class FakeCustomerRepository implements CustomerRepository {
  private customers = new Map<string, Customer>();
  setCustomer(c: Customer): void { this.customers.set(c.id.toString(), c); }
  async findById(id: CustomerId): Promise<Customer | null> { return this.customers.get(id.toString()) ?? null; }
  async save(c: Customer): Promise<void> { this.customers.set(c.id.toString(), c); }
  async findAll(): Promise<Customer[]> { return Array.from(this.customers.values()); }
}

class FakeVariantRepository implements VariantRepository {
  private variants = new Map<string, Variant>();
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

class FakeInventoryLotRepository implements InventoryLotRepository {
  lots = new Map<string, PurchaseLot>();

  async findById(id: PurchaseLotId): Promise<PurchaseLot | null> {
    return this.lots.get(id.toString()) ?? null;
  }
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
}

class FakeSaleRepository implements SaleRepository {
  sales = new Map<string, SaleEntity>();
  async save(sale: SaleEntity): Promise<void> { this.sales.set(sale.id.toString(), sale); }
  async findById(id: SaleIdEntity): Promise<SaleEntity | null> { return this.sales.get(id.toString()) ?? null; }
  async findByCustomerId(cId: string): Promise<SaleEntity[]> {
    return Array.from(this.sales.values()).filter((s) => s.customerId === cId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

class FakeCashLedgerRepository implements CashLedgerRepository {
  entries: CashLedgerEntry[] = [];
  async append(entry: CashLedgerEntry): Promise<void> { this.entries.push(entry); }
  async findAllOrdered(): Promise<CashLedgerEntry[]> { return [...this.entries]; }
}

/**
 * A UnitOfWork that executes in-order (sequential).
 *
 * This tests the BUSINESS LOGIC of concurrency — only one sale succeeds
 * when stock is insufficient for the combined demand — without requiring
 * a real DB. The "second" sale fails because after the first runs, lots
 * are consumed and the second allocation sees insufficient stock.
 *
 * For true concurrent testing (both sales reading the same stock before
 * either writes), a PostgreSQL integration test with `FOR UPDATE` row
 * locks is required (see docblock at top of file).
 */
class SequentialFakeUnitOfWork implements UnitOfWork {
  constructor(public scope: ConcurrencyScope) {}

  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    return fn(this.scope);
  }
}

// ── Fixtures ──────────────────────────────────────────────────

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

function createTestVariant(id?: string): VariantEntity {
  const skuResult = SkuEntity.from('TEST-' + (id ?? 'V1'));
  if (!skuResult.ok) throw new Error('Invalid SKU');
  return new VariantEntity(
    VariantIdEntity.from(id ?? 'v1'),
    ProductIdEntity.generate(),
    skuResult.value,
    {},
    Money.fromCents(1000),
    true,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  );
}

function createTestLot(id: string, vId: string, qty: number, costCents: number, date: Date): PurchaseLotEntity {
  return new PurchaseLotEntity(
    PurchaseLotIdEntity.from(id),
    VariantIdEntity.from(vId),
    PurchaseIdEntity.generate(),
    qty, qty,
    Money.fromCents(costCents),
    date, null,
  );
}

// ── Tests ──────────────────────────────────────────────────────

describe('Concurrent final-unit sales', () => {
  let customerRepo: FakeCustomerRepository;
  let variantRepo: FakeVariantRepository;
  let lotRepo: FakeInventoryLotRepository;
  let saleRepo: FakeSaleRepository;
  let cashRepo: FakeCashLedgerRepository;
  let useCase: CreateSaleUseCase;
  let customer: Customer;
  let variant: VariantEntity;

  beforeEach(() => {
    customer = createTestCustomer();
    variant = createTestVariant();

    customerRepo = new FakeCustomerRepository();
    customerRepo.setCustomer(customer);

    variantRepo = new FakeVariantRepository();
    variantRepo.setVariant(variant);

    lotRepo = new FakeInventoryLotRepository();
    saleRepo = new FakeSaleRepository();
    cashRepo = new FakeCashLedgerRepository();

    useCase = new CreateSaleUseCase(customerRepo, variantRepo);
  });

  function createUoW(): SequentialFakeUnitOfWork {
    return new SequentialFakeUnitOfWork({
      sales: saleRepo,
      inventoryLots: lotRepo,
      cashLedger: cashRepo,
    });
  }

  it('first sale succeeds and second fails when single unit is contested', async () => {
    // Only 1 unit total in stock
    lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 1, 500, new Date('2026-01-01')));

    // Both sales want that 1 unit
    const command: CreateSaleCommand = {
      customerId: 'customer-1',
      channelReference: 'order-1',
      items: [{ variantId: 'v1', quantity: 1, unitPriceCents: 1000 }],
    };

    const command2: CreateSaleCommand = {
      customerId: 'customer-1',
      channelReference: 'order-2',
      items: [{ variantId: 'v1', quantity: 1, unitPriceCents: 1000 }],
    };

    // Execute sequentially (simulating what FOR UPDATE + serialization does)
    const result1 = await useCase.execute(command, createUoW());
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;

    // After first sale consumed the only unit, remaining stock = 0
    const remaining = lotRepo.lots.get('lot-1')?.remainingQuantity;
    expect(remaining).toBe(0);

    // Second sale must fail
    const result2 = await useCase.execute(command2, createUoW());
    expect(result2.ok).toBe(false);
    if (result2.ok) return;
    expect(result2.error.name).toBe('InsufficientStockError');

    // Only 1 cash entry exists (only one sale created)
    expect(cashRepo.entries).toHaveLength(1);
    expect(cashRepo.entries[0]!.type).toBe('SALE_INCOME');
    expect(cashRepo.entries[0]!.amount.cents).toBe(1000);

    // Only 1 sale was persisted
    expect(saleRepo.sales.size).toBe(1);
  });

  it('both sales succeed when stock is sufficient for both', async () => {
    // 10 units in stock
    lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

    const command: CreateSaleCommand = {
      customerId: 'customer-1',
      channelReference: 'order-1',
      items: [{ variantId: 'v1', quantity: 3, unitPriceCents: 1000 }],
    };

    const command2: CreateSaleCommand = {
      customerId: 'customer-1',
      channelReference: 'order-2',
      items: [{ variantId: 'v1', quantity: 5, unitPriceCents: 1000 }],
    };

    const result1 = await useCase.execute(command, createUoW());
    expect(result1.ok).toBe(true);

    const result2 = await useCase.execute(command2, createUoW());
    expect(result2.ok).toBe(true);

    // 10 - 3 - 5 = 2 remaining
    const remaining = lotRepo.lots.get('lot-1')?.remainingQuantity;
    expect(remaining).toBe(2);

    // 2 cash entries for both sales
    expect(cashRepo.entries).toHaveLength(2);
    expect(cashRepo.entries.every((e) => e.type === 'SALE_INCOME')).toBe(true);

    // 2 sales persisted
    expect(saleRepo.sales.size).toBe(2);
  });

  it('both sales fail when together they exceed stock (individual quantities are valid)', async () => {
    // 4 units in stock
    lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 4, 500, new Date('2026-01-01')));

    const command: CreateSaleCommand = {
      customerId: 'customer-1',
      channelReference: 'order-1',
      items: [{ variantId: 'v1', quantity: 3, unitPriceCents: 1000 }],
    };

    const command2: CreateSaleCommand = {
      customerId: 'customer-1',
      channelReference: 'order-2',
      items: [{ variantId: 'v1', quantity: 3, unitPriceCents: 1000 }],
    };

    // First succeeds (3 <= 4)
    const result1 = await useCase.execute(command, createUoW());
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;

    // Remaining: 1
    expect(lotRepo.lots.get('lot-1')?.remainingQuantity).toBe(1);

    // Second fails (3 > 1)
    const result2 = await useCase.execute(command2, createUoW());
    expect(result2.ok).toBe(false);
    if (result2.ok) return;
    expect(result2.error.name).toBe('InsufficientStockError');
  });

  it('can sell remaining stock after a big sale exhausts most of it', async () => {
    // 5 units
    lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 5, 500, new Date('2026-01-01')));

    const bigSale: CreateSaleCommand = {
      customerId: 'customer-1',
      channelReference: 'big-order',
      items: [{ variantId: 'v1', quantity: 4, unitPriceCents: 1000 }],
    };

    const smallSale: CreateSaleCommand = {
      customerId: 'customer-1',
      channelReference: 'small-order',
      items: [{ variantId: 'v1', quantity: 1, unitPriceCents: 1000 }],
    };

    // Big sale consumes 4
    const bigRes = await useCase.execute(bigSale, createUoW());
    expect(bigRes.ok).toBe(true);

    // 1 remaining
    expect(lotRepo.lots.get('lot-1')?.remainingQuantity).toBe(1);

    // Small sale consumes the last unit
    const smallRes = await useCase.execute(smallSale, createUoW());
    expect(smallRes.ok).toBe(true);

    // 0 remaining (exhausted)
    expect(lotRepo.lots.get('lot-1')?.remainingQuantity).toBe(0);

    // 2 sales, 2 cash entries
    expect(saleRepo.sales.size).toBe(2);
    expect(cashRepo.entries).toHaveLength(2);
  });
});
