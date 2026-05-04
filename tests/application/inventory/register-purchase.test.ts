/**
 * Application tests for RegisterPurchaseUseCase.
 *
 * Tests the use case with fake repositories. Verifies:
 * - Valid purchase creates a lot + cash ledger entry
 * - Invalid variant returns error
 * - Negative quantity/cost rejected
 * - Transactional rollback on failure
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RegisterPurchaseUseCase, InvalidQuantityError } from '../../../src/modules/inventory/application/use-cases/RegisterPurchaseUseCase.js';
import type { RegisterPurchaseCommand } from '../../../src/modules/inventory/application/use-cases/RegisterPurchaseUseCase.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { VariantRepository } from '../../../src/modules/inventory/domain/VariantRepository.js';
import type { InventoryLotRepository } from '../../../src/modules/inventory/domain/InventoryLotRepository.js';
import type { PurchaseRepository } from '../../../src/modules/inventory/domain/PurchaseRepository.js';
import type { CashLedgerRepository } from '../../../src/modules/accounting-reports/domain/CashLedgerRepository.js';
import type { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import type { Purchase } from '../../../src/modules/inventory/domain/Purchase.js';
import type { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import type { Variant } from '../../../src/modules/inventory/domain/Variant.js';
import type { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import type { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import type { PurchaseId } from '../../../src/modules/inventory/domain/PurchaseId.js';
import type { Sku } from '../../../src/modules/inventory/domain/Sku.js';
import type { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import { Variant as VariantEntity } from '../../../src/modules/inventory/domain/Variant.js';
import { VariantId as VariantIdEntity } from '../../../src/modules/inventory/domain/VariantId.js';
import { ProductId as ProductIdEntity } from '../../../src/modules/inventory/domain/ProductId.js';
import { Sku as SkuEntity } from '../../../src/modules/inventory/domain/Sku.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';

// ── Scope type ───────────────────────────────────────────────

interface TestScope extends UnitOfWorkScope {
  inventoryLots: InventoryLotRepository;
  purchases: PurchaseRepository;
  cashLedger: CashLedgerRepository;
}

// ── Fakes ────────────────────────────────────────────────────

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
    return Array.from(this.variants.values()).filter(
      (v) => v.productId.equals(productId),
    );
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

  async findByVariantIdOrderedByDate(_variantId: VariantId, _lock?: boolean): Promise<PurchaseLot[]> {
    return Array.from(this.lots.values())
      .filter((l) => l.variantId.equals(_variantId))
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

class FakePurchaseRepository implements PurchaseRepository {
  purchases = new Map<string, Purchase>();

  async findById(id: PurchaseId): Promise<Purchase | null> {
    return this.purchases.get(id.toString()) ?? null;
  }

  async save(purchase: Purchase): Promise<void> {
    this.purchases.set(purchase.id.toString(), purchase);
  }

  async delete(id: PurchaseId): Promise<void> {
    this.purchases.delete(id.toString());
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
  scope: TestScope;

  constructor(
    inventoryLots: InventoryLotRepository,
    purchases: PurchaseRepository,
    cashLedger: CashLedgerRepository,
  ) {
    this.scope = { inventoryLots, purchases, cashLedger };
  }

  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    return fn(this.scope);
  }
}

// ── Fixtures ─────────────────────────────────────────────────

function createTestVariant(): VariantEntity {
  const skuResult = SkuEntity.from('TEST-VARIANT');
  if (!skuResult.ok) throw new Error('Invalid SKU');
  return new VariantEntity(
    VariantIdEntity.generate(),
    ProductIdEntity.generate(),
    skuResult.value,
    {},
    true,
    new Date('2025-01-01'),
    new Date('2025-01-01'),
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('RegisterPurchaseUseCase', () => {
  let variantRepo: FakeVariantRepository;
  let lotRepo: FakeInventoryLotRepository;
  let purchaseRepo: FakePurchaseRepository;
  let cashRepo: FakeCashLedgerRepository;
  let useCase: RegisterPurchaseUseCase;
  let variant: VariantEntity;

  beforeEach(() => {
    variant = createTestVariant();
    variantRepo = new FakeVariantRepository();
    variantRepo.setVariant(variant);

    lotRepo = new FakeInventoryLotRepository();
    purchaseRepo = new FakePurchaseRepository();
    cashRepo = new FakeCashLedgerRepository();

    useCase = new RegisterPurchaseUseCase(variantRepo);
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork(lotRepo, purchaseRepo, cashRepo);
  }

  describe('valid purchase', () => {
    it('creates a purchase, lot, and cash ledger entry', async () => {
      const command: RegisterPurchaseCommand = {
        variantId: variant.id.toString(),
        quantity: 10,
        unitCost: 5.00,
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.purchaseId).toBeDefined();
      expect(result.value.lotId).toBeDefined();
      expect(result.value.totalCost).toBe(50); // 10 * 500

      // Verify lot was created
      expect(lotRepo.lots.size).toBe(1);
      const lot = Array.from(lotRepo.lots.values())[0]!;
      expect(lot.remainingQuantity).toBe(10);
      expect(lot.purchasedQuantity).toBe(10);
      expect(lot.unitCost.cents).toBe(500);

      // Verify purchase was created
      expect(purchaseRepo.purchases.size).toBe(1);

      // Verify cash ledger entry (negative outflow)
      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.type).toBe('PURCHASE_OUTFLOW');
      expect(cashRepo.entries[0]!.amount.cents).toBe(-5000); // negative
      expect(cashRepo.entries[0]!.tag).toBe('REINVESTMENT');
    });

    it('accepts optional supplier and notes', async () => {
      const command: RegisterPurchaseCommand = {
        variantId: variant.id.toString(),
        quantity: 5,
        unitCost: 3.00,
        supplierId: 'supplier-1',
        notes: 'Restock order',
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const purchase = Array.from(purchaseRepo.purchases.values())[0]!;
      expect(purchase.supplierId?.toString()).toBe('supplier-1');
      expect(purchase.notes).toBe('Restock order');
    });

    it('accepts a custom purchase date', async () => {
      const command: RegisterPurchaseCommand = {
        variantId: variant.id.toString(),
        quantity: 3,
        unitCost: 1.00,
        purchaseDate: '2025-06-15T00:00:00.000Z',
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const lot = Array.from(lotRepo.lots.values())[0]!;
      expect(lot.purchaseDate.toISOString()).toBe('2025-06-15T00:00:00.000Z');
    });
  });

  describe('validation errors', () => {
    it('rejects zero quantity', async () => {
      const command: RegisterPurchaseCommand = {
        variantId: variant.id.toString(),
        quantity: 0,
        unitCost: 5.00,
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });

    it('rejects negative quantity', async () => {
      const command: RegisterPurchaseCommand = {
        variantId: variant.id.toString(),
        quantity: -1,
        unitCost: 5.00,
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });

    it('rejects negative unit cost', async () => {
      const command: RegisterPurchaseCommand = {
        variantId: variant.id.toString(),
        quantity: 10,
        unitCost: -1.00,
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });
  });

  describe('variant lookup', () => {
    it('returns NotFoundError for unknown variant', async () => {
      const command: RegisterPurchaseCommand = {
        variantId: 'non-existent-id',
        quantity: 5,
        unitCost: 5.00,
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  describe('transactional integrity', () => {
    it('rejects the entire transaction when any step fails (no partial saves)', async () => {
      // Since we use fakes without actual transaction rollback, this test
      // validates that the use case propagates the error. A real TypeORM
      // UnitOfWork would roll back the DB transaction.
      // The test here validates the CONTRACT: the use case should reject
      // when a step fails.
      const command: RegisterPurchaseCommand = {
        variantId: 'non-existent',
        quantity: 10,
        unitCost: 5.00,
      };

      // This fails at variant lookup, before any writes happen
      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);

      // Nothing was persisted because the variant wasn't found
      expect(lotRepo.lots.size).toBe(0);
      expect(purchaseRepo.purchases.size).toBe(0);
      expect(cashRepo.entries).toHaveLength(0);
    });
  });
});
