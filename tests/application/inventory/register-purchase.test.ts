/**
 * Application tests for RegisterPurchaseUseCase.
 *
 * Tests the use case with fake repositories. Verifies:
 * - Batch purchase with multiple items creates lots + single cash ledger entry
 * - Invalid variant aborts the entire batch (no partial saves)
 * - Empty items array / invalid item data rejected
 * - Transactional contract: failure before any write leaves nothing persisted
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

function createTestVariant(skuLabel = 'TEST-VARIANT'): VariantEntity {
  const skuResult = SkuEntity.from(skuLabel);
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
  let variantA: VariantEntity;
  let variantB: VariantEntity;

  beforeEach(() => {
    variantA = createTestVariant('VARIANT-A');
    variantB = createTestVariant('VARIANT-B');
    variantRepo = new FakeVariantRepository();
    variantRepo.setVariant(variantA);
    variantRepo.setVariant(variantB);

    lotRepo = new FakeInventoryLotRepository();
    purchaseRepo = new FakePurchaseRepository();
    cashRepo = new FakeCashLedgerRepository();

    useCase = new RegisterPurchaseUseCase(variantRepo);
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork(lotRepo, purchaseRepo, cashRepo);
  }

  describe('batch purchase with items[]', () => {
    it('creates multiple lots and one cash outflow from multiple items', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 10, unitCost: 5.00 },
          { variantId: variantB.id.toString(), quantity: 5, unitCost: 3.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Response has purchaseId and lots array
      expect(result.value.purchaseId).toBeDefined();
      expect(result.value.lots).toHaveLength(2);

      // Total cost: 10*5 + 5*3 = 50 + 15 = 65 soles
      expect(result.value.totalCost).toBe(65);

      // Two lots persisted
      expect(lotRepo.lots.size).toBe(2);
      const lots = Array.from(lotRepo.lots.values());
      const lotA = lots.find((l) => l.variantId.equals(variantA.id))!;
      const lotB = lots.find((l) => l.variantId.equals(variantB.id))!;
      expect(lotA.remainingQuantity).toBe(10);
      expect(lotA.unitCost.cents).toBe(500);
      expect(lotB.remainingQuantity).toBe(5);
      expect(lotB.unitCost.cents).toBe(300);

      // One purchase created
      expect(purchaseRepo.purchases.size).toBe(1);

      // One cash ledger entry for total (negative outflow)
      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.type).toBe('PURCHASE_OUTFLOW');
      expect(cashRepo.entries[0]!.amount.cents).toBe(-6500);
      expect(cashRepo.entries[0]!.tag).toBe('REINVESTMENT');
    });

    it('accepts optional supplier and notes shared across items', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 5, unitCost: 3.00 },
        ],
        supplierId: 'supplier-1',
        notes: 'Batch restock',
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const purchase = Array.from(purchaseRepo.purchases.values())[0]!;
      expect(purchase.supplierId?.toString()).toBe('supplier-1');
      expect(purchase.notes).toBe('Batch restock');
    });

    it('accepts a custom purchase date shared across items', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 3, unitCost: 1.00 },
        ],
        purchaseDate: '2025-06-15T00:00:00.000Z',
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const lot = Array.from(lotRepo.lots.values())[0]!;
      expect(lot.purchaseDate.toISOString()).toBe('2025-06-15T00:00:00.000Z');
    });

    it('single item purchase still works (backward compat)', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 10, unitCost: 5.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.lots).toHaveLength(1);
      expect(lotRepo.lots.size).toBe(1);
      expect(cashRepo.entries).toHaveLength(1);
      expect(cashRepo.entries[0]!.amount.cents).toBe(-5000);
    });
  });

  describe('validation errors', () => {
    it('rejects empty items array', async () => {
      const command: RegisterPurchaseCommand = { items: [] };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });

    it('rejects item with zero quantity', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 0, unitCost: 5.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });

    it('rejects item with negative quantity', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: -1, unitCost: 5.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });

    it('rejects item with negative unit cost', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 10, unitCost: -1.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });

    it('rejects item with fractional (non-integer) quantity', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 1.5, unitCost: 5.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });

    it('rejects batch when any item has fractional quantity even if others are valid', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 10, unitCost: 5.00 },
          { variantId: variantB.id.toString(), quantity: 2.5, unitCost: 3.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });

    it('accepts quantity expressed as float with zero decimals (10.0)', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 10.0, unitCost: 5.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(true);
    });

    it('rejects negative unit cost even when other items are valid', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 10, unitCost: 5.00 },
          { variantId: variantB.id.toString(), quantity: 5, unitCost: -3.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidQuantityError);
    });
  });

  describe('variant lookup', () => {
    it('returns NotFoundError for unknown variant in single-item batch', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: 'non-existent-id', quantity: 5, unitCost: 5.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });

    it('rejects entire batch when one item references unknown variant', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: variantA.id.toString(), quantity: 10, unitCost: 5.00 },
          { variantId: 'bad-id', quantity: 5, unitCost: 3.00 },
        ],
      };

      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);

      // Nothing was persisted — all-or-nothing
      expect(lotRepo.lots.size).toBe(0);
      expect(purchaseRepo.purchases.size).toBe(0);
      expect(cashRepo.entries).toHaveLength(0);
    });
  });

  describe('transactional integrity', () => {
    it('persists nothing when any step fails before writes', async () => {
      const command: RegisterPurchaseCommand = {
        items: [
          { variantId: 'non-existent', quantity: 10, unitCost: 5.00 },
        ],
      };

      // This fails at variant lookup, before any writes
      const result = await useCase.execute(command, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);

      expect(lotRepo.lots.size).toBe(0);
      expect(purchaseRepo.purchases.size).toBe(0);
      expect(cashRepo.entries).toHaveLength(0);
    });
  });
});
