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
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CreateSaleUseCase, MissingChannelReferenceError } from '../../../src/modules/sales-returns/application/use-cases/CreateSaleUseCase.js';
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
import type { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import type { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import type { Sku } from '../../../src/modules/inventory/domain/Sku.js';
import { Customer } from '../../../src/modules/customers/domain/Customer.js';
import { CustomerId } from '../../../src/modules/customers/domain/CustomerId.js';
import { Variant as VariantEntity } from '../../../src/modules/inventory/domain/Variant.js';
import { VariantId as VariantIdEntity } from '../../../src/modules/inventory/domain/VariantId.js';
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
}

class FakeCashLedgerRepository implements CashLedgerRepository {
  entries: CashLedgerEntry[] = [];

  async append(entry: CashLedgerEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findAllOrdered(): Promise<CashLedgerEntry[]> {
    return [...this.entries];
  }
}

class FakeUnitOfWork implements UnitOfWork {
  scope: SaleTestScope;

  constructor(
    sales: SaleRepository,
    inventoryLots: InventoryLotRepository,
    cashLedger: CashLedgerRepository,
  ) {
    this.scope = { sales, inventoryLots, cashLedger };
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
  let lotRepo: FakeInventoryLotRepository;
  let saleRepo: FakeSaleRepository;
  let cashRepo: FakeCashLedgerRepository;
  let useCase: CreateSaleUseCase;
  let customer: Customer;
  let variant1: VariantEntity;
  let variant2: VariantEntity;

  beforeEach(() => {
    customer = createTestCustomer();
    variant1 = createTestVariant('v1');
    variant2 = createTestVariant('v2');

    customerRepo = new FakeCustomerRepository();
    customerRepo.setCustomer(customer);

    variantRepo = new FakeVariantRepository();
    variantRepo.setVariant(variant1);
    variantRepo.setVariant(variant2);

    lotRepo = new FakeInventoryLotRepository();
    saleRepo = new FakeSaleRepository();
    cashRepo = new FakeCashLedgerRepository();

    useCase = new CreateSaleUseCase(customerRepo, variantRepo);
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork(saleRepo, lotRepo, cashRepo);
  }

  // ── Valid multi-item sale ──────────────────────────────────

  describe('valid multi-item sale', () => {
    it('creates sale with lines, consumptions, and cash entry', async () => {
      // One lot for v1 with enough stock
      lotRepo.lots.set('lot-v1', createTestLot('lot-v1', 'v1', 10, 500, new Date('2026-01-01')));
      // One lot for v2 with enough stock
      lotRepo.lots.set('lot-v2', createTestLot('lot-v2', 'v2', 5, 1200, new Date('2026-01-02')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channelReference: 'shopify-order-456',
        items: [
          { variantId: 'v1', quantity: 3, unitPriceCents: 2000 },
          { variantId: 'v2', quantity: 2, unitPriceCents: 5000 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Verify response totals
      // Revenue: 3*2000 + 2*5000 = 6000 + 10000 = 16000
      expect(result.value.totalRevenueCents).toBe(16000);
      // Cost: 3*500 + 2*1200 = 1500 + 2400 = 3900
      expect(result.value.totalCostCents).toBe(3900);
      // Profit: 16000 - 3900 = 12100
      expect(result.value.grossProfitCents).toBe(12100);
      expect(result.value.saleId).toBeDefined();

      // Verify sale was persisted
      expect(saleRepo.sales.size).toBe(1);

      // Verify lots were consumed
      const lot1 = lotRepo.lots.get('lot-v1');
      expect(lot1?.remainingQuantity).toBe(7); // 10 - 3

      const lot2 = lotRepo.lots.get('lot-v2');
      expect(lot2?.remainingQuantity).toBe(3); // 5 - 2

      // Verify cash ledger entry (positive SALE_INCOME)
      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.type).toBe('SALE_INCOME');
      expect(cashRepo.entries[0]!.amount.cents).toBe(16000);
      expect(cashRepo.entries[0]!.sourceId).toBe(result.value.saleId);
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
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 7, unitPriceCents: 1000 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should consume 5 from old lot (200 each) + 2 from new lot (500 each)
      // Cost: 5*200 + 2*500 = 1000 + 1000 = 2000
      expect(result.value.totalCostCents).toBe(2000);
      expect(result.value.totalRevenueCents).toBe(7000);
      expect(result.value.grossProfitCents).toBe(5000);

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
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 10, unitPriceCents: 1000 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('Insufficient stock');
    });

    it('rejects sale when variant has no lots at all', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 1, unitPriceCents: 1000 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('Insufficient stock');
    });
  });

  // ── Required customer ──────────────────────────────────────

  describe('required customer', () => {
    it('rejects sale with unknown customer', async () => {
      const command: CreateSaleCommand = {
        customerId: 'non-existent-customer',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 1, unitPriceCents: 1000 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(result.error.message).toContain('Customer');
    });
  });

  // ── Required channel reference ─────────────────────────────

  describe('required channel reference', () => {
    it('rejects sale with empty channel reference', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channelReference: '',
        items: [{ variantId: 'v1', quantity: 1, unitPriceCents: 1000 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(MissingChannelReferenceError);
    });

    it('rejects sale with whitespace-only channel reference', async () => {
      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channelReference: '   ',
        items: [{ variantId: 'v1', quantity: 1, unitPriceCents: 1000 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(MissingChannelReferenceError);
    });
  });

  // ── Cash entry creation ────────────────────────────────────

  describe('cash entry creation', () => {
    it('creates positive SALE_INCOME cash entry for total revenue', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 5, 300, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channelReference: 'pos-terminal-001',
        items: [{ variantId: 'v1', quantity: 3, unitPriceCents: 1500 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.type).toBe('SALE_INCOME');
      expect(cashRepo.entries[0]!.amount.cents).toBe(4500); // 3*1500
      expect(cashRepo.entries[0]!.amount.isPositive()).toBe(true);
      expect(cashRepo.entries[0]!.tag).toBeNull();
    });
  });

  // ── Exact profit calculations ──────────────────────────────

  describe('exact profit calculations', () => {
    it('calculates profit from frozen costs correctly', async () => {
      // Lot purchased at 750 each
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 750, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channelReference: 'web-order',
        items: [{ variantId: 'v1', quantity: 4, unitPriceCents: 2500 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Revenue: 4 * 2500 = 10000
      // Cost: 4 * 750 = 3000
      // Profit: 10000 - 3000 = 7000
      expect(result.value.totalRevenueCents).toBe(10000);
      expect(result.value.totalCostCents).toBe(3000);
      expect(result.value.grossProfitCents).toBe(7000);
    });
  });

  // ── Transactional rollback ─────────────────────────────────

  describe('transactional integrity', () => {
    it('rejects entire transaction when any item fails, leaving no partial state', async () => {
      // Lot for variant-1 but NOT for variant-2
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channelReference: 'web-order',
        items: [
          { variantId: 'v1', quantity: 2, unitPriceCents: 1000 },
          { variantId: 'v2', quantity: 5, unitPriceCents: 2000 }, // no lots for v2
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('Insufficient stock');

      // Verify nothing was saved
      expect(saleRepo.sales.size).toBe(0);
      expect(cashRepo.entries).toHaveLength(0);

      // Lot 1 should NOT have been consumed (rolled back)
      const lot1 = lotRepo.lots.get('lot-1');
      expect(lot1?.remainingQuantity).toBe(10);
    });
  });

  // ── Variant not found ──────────────────────────────────────

  describe('variant lookup', () => {
    it('rejects sale with unknown variant', async () => {
      lotRepo.lots.set('lot-1', createTestLot('lot-1', 'v1', 10, 500, new Date('2026-01-01')));

      const command: CreateSaleCommand = {
        customerId: 'customer-1',
        channelReference: 'web-order',
        items: [{ variantId: 'non-existent-variant', quantity: 1, unitPriceCents: 1000 }],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(result.error.message).toContain('Variant');
    });
  });
});
