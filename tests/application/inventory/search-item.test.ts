/**
 * Application tests for SearchItemUseCase — SKU or alias search that
 * resolves product/variant data unambiguously.
 *
 * Verifies:
 * - Search by SKU returns the exact variant
 * - Search by alias returns variants of matched products
 * - Alias search is case-insensitive
 * - Search for non-existent term returns error
 * - SKU match is preferred over alias match when both exist
 */
import { describe, it, expect } from 'vitest';
import { SearchItemUseCase } from '../../../src/modules/inventory/application/use-cases/SearchItemUseCase.js';
import type { ProductRepository } from '../../../src/modules/inventory/domain/ProductRepository.js';
import type { VariantRepository } from '../../../src/modules/inventory/domain/VariantRepository.js';
import type { InventoryLotRepository } from '../../../src/modules/inventory/domain/InventoryLotRepository.js';
import type { Variant } from '../../../src/modules/inventory/domain/Variant.js';
import { Variant as VariantEntity } from '../../../src/modules/inventory/domain/Variant.js';
import type { Product } from '../../../src/modules/inventory/domain/Product.js';
import { Product as ProductEntity } from '../../../src/modules/inventory/domain/Product.js';
import type { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { PurchaseId } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { SupplierId } from '../../../src/modules/inventory/domain/SupplierId.js';
import { PurchaseLot as PurchaseLotEntity } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import { Sku } from '../../../src/modules/inventory/domain/Sku.js';
import { Alias } from '../../../src/modules/inventory/domain/Alias.js';
import { Money } from '../../../src/shared/domain/Money.js';

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
    return Array.from(this.variants.values()).filter((v) =>
      v.productId.equals(productId),
    );
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

  async findByAlias(alias: string): Promise<Product[]> {
    const lower = alias.toLowerCase();
    return Array.from(this.products.values()).filter((p) =>
      p.aliases.some((a) => a.value === lower),
    );
  }

  async save(product: Product): Promise<void> {
    this.products.set(product.id.toString(), product);
  }

  async delete(id: ProductId): Promise<void> {
    this.products.delete(id.toString());
  }

  async findAllActive(): Promise<Product[]> {
    return Array.from(this.products.values()).filter((p) => p.isActive);
  }
}

/** Simple fake that returns configurable lots per variant. Defaults to empty (= stock 0). */
class FakeInventoryLotRepository implements InventoryLotRepository {
  private lotsByVariant = new Map<string, PurchaseLot[]>();

  /** Set lots for a variant (used by tests to configure stock). */
  setLotsForVariant(variantId: string, lots: PurchaseLot[]): void {
    this.lotsByVariant.set(variantId, lots);
  }

  async findById(): Promise<PurchaseLot | null> {
    return null;
  }

  async findByIds(): Promise<PurchaseLot[]> {
    return [];
  }

  async findByVariantIdOrderedByDate(variantId: VariantId): Promise<PurchaseLot[]> {
    return this.lotsByVariant.get(variantId.toString()) ?? [];
  }

  async save(): Promise<void> { /* noop */ }
  async saveMany(): Promise<void> { /* noop */ }
  async delete(): Promise<void> { /* noop */ }
  async findByIdForUpdate(): Promise<PurchaseLot | null> { return null; }
  async hasConsumptionRecords(): Promise<boolean> { return false; }
}

// ── Helpers ──────────────────────────────────────────────────

function makeProduct(
  id: string,
  name: string,
  aliases: string[],
): Product {
  const aliasObjs: Alias[] = [];
  for (const a of aliases) {
    const r = Alias.from(a);
    if (r.ok) aliasObjs.push(r.value);
  }

  return new ProductEntity(
    ProductId.from(id),
    name,
    null,
    'test-sku',
    Money.fromCents(1000),
    null,
    aliasObjs,
    true,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  );
}

function makeVariant(
  id: string,
  productId: string,
  skuStr: string,
): Variant {
  const skuResult = Sku.from(skuStr);
  if (!skuResult.ok) throw new Error(`Invalid SKU: ${skuStr}`);
  return new VariantEntity(
    VariantId.from(id),
    ProductId.from(productId),
    skuResult.value,
    {},
    true,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('SearchItemUseCase', () => {
  const PRODUCT_A_ID = 'prod-a';
  const PRODUCT_B_ID = 'prod-b';
  const VARIANT_A1_ID = 'var-a1';
  const VARIANT_A2_ID = 'var-a2';
  const VARIANT_B1_ID = 'var-b1';

  function createUseCase(): {
    useCase: SearchItemUseCase;
    variantRepo: FakeVariantRepository;
    productRepo: FakeProductRepository;
    lotRepo: FakeInventoryLotRepository;
  } {
    const variantRepo = new FakeVariantRepository();
    const productRepo = new FakeProductRepository();
    const lotRepo = new FakeInventoryLotRepository();

    // Product A — cola-based drink with aliases
    const productA = makeProduct(PRODUCT_A_ID, 'Cola Drink 500ml', [
      'coca cola',
      'coke',
      'cola',
    ]);
    productRepo.setProduct(productA);

    // Variant A1 — 500ml bottle
    variantRepo.setVariant(
      makeVariant(VARIANT_A1_ID, PRODUCT_A_ID, 'cola-500ml'),
    );

    // Variant A2 — 1L bottle
    variantRepo.setVariant(
      makeVariant(VARIANT_A2_ID, PRODUCT_A_ID, 'cola-1l'),
    );

    // Product B — lemon soda
    const productB = makeProduct(PRODUCT_B_ID, 'Lemon Soda 350ml', [
      'lemon',
      'limon',
    ]);
    productRepo.setProduct(productB);

    // Variant B1
    variantRepo.setVariant(
      makeVariant(VARIANT_B1_ID, PRODUCT_B_ID, 'lemon-350ml'),
    );

    const useCase = new SearchItemUseCase(variantRepo, productRepo, lotRepo);
    return { useCase, variantRepo, productRepo, lotRepo };
  }

  it('resolves variant by exact SKU match', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute({ term: 'cola-500ml' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matchType).toBe('sku');
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]!.variantSku).toBe('cola-500ml');
    expect(result.value.items[0]!.variantId).toBe(VARIANT_A1_ID);
    expect(result.value.items[0]!.productName).toBe('Cola Drink 500ml');
  });

  it('resolves variant by SKU with case-insensitive input', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute({ term: 'COLA-500ML' });
    // SKU is normalized to lowercase during Sku.from(), so uppercase input
    // should still match via VariantRepository.findBySku

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matchType).toBe('sku');
    expect(result.value.items[0]!.variantSku).toBe('cola-500ml');
    expect(result.value.items[0]!.variantId).toBe(VARIANT_A1_ID);
  });

  it('resolves variant by alias when SKU not found', async () => {
    const { useCase } = createUseCase();

    // "coke" is an alias for Product A — should resolve to both variants
    const result = await useCase.execute({ term: 'coke' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matchType).toBe('alias');
    // Product A has 2 variants
    expect(result.value.items).toHaveLength(2);
    const skus = result.value.items.map((i) => i.variantSku).sort();
    expect(skus).toEqual(['cola-1l', 'cola-500ml']);
  });

  it('resolves variant by alias case-insensitively', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute({ term: 'COCA COLA' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matchType).toBe('alias');
    expect(result.value.items).toHaveLength(2);
  });

  it('prefers SKU match over alias match', async () => {
    const { useCase } = createUseCase();
    // "cola" is both a partial alias AND a possible SKU (but SKU is 'cola-500ml')
    // Since the search input "cola-500ml" is a valid SKU, it should
    // match by SKU first (not by the "cola" alias)

    const result = await useCase.execute({ term: 'cola-500ml' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should match as SKU, not alias — even though "cola" is an alias too
    expect(result.value.matchType).toBe('sku');
    expect(result.value.items).toHaveLength(1);
  });

  it('returns error for non-existent term', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute({ term: 'NONEXISTENT-SKU' });

    expect(result.ok).toBe(false);
  });

  it('returns error for empty search term', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute({ term: '  ' });

    expect(result.ok).toBe(false);
  });

  // ── Stock aggregation tests ──────────────────────────────────

  function makeLot(
    id: string,
    variantId: string,
    purchasedQuantity: number,
    remainingQuantity: number,
  ): PurchaseLotEntity {
    return new PurchaseLotEntity(
      PurchaseLotId.from(id),
      VariantId.from(variantId),
      PurchaseId.from('purchase-1'),
      purchasedQuantity,
      remainingQuantity,
      Money.fromCents(1000),
      new Date('2026-01-01'),
      SupplierId.from('supplier-1'),
    );
  }

  it('includes stock from open lots on SKU match', async () => {
    const { useCase, lotRepo } = createUseCase();

    // VARIANT_A1 has 2 open lots: 5 + 3 = 8 stock
    lotRepo.setLotsForVariant(VARIANT_A1_ID, [
      makeLot('lot-a1-1', VARIANT_A1_ID, 5, 5),
      makeLot('lot-a1-2', VARIANT_A1_ID, 10, 3),
    ]);

    const result = await useCase.execute({ term: 'cola-500ml' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]!.stock).toBe(8);
  });

  it('returns stock 0 when variant has no lots', async () => {
    const { useCase } = createUseCase();

    const result = await useCase.execute({ term: 'cola-500ml' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]!.stock).toBe(0);
  });

  it('excludes exhausted lots from stock calculation', async () => {
    const { useCase, lotRepo } = createUseCase();

    // VARIANT_A1 has 1 open lot (5) and 1 exhausted lot (0 remaining)
    lotRepo.setLotsForVariant(VARIANT_A1_ID, [
      makeLot('lot-a1-1', VARIANT_A1_ID, 5, 5),
      makeLot('lot-a1-2', VARIANT_A1_ID, 10, 0),
    ]);

    const result = await useCase.execute({ term: 'cola-500ml' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]!.stock).toBe(5);
  });

  it('includes stock on alias match', async () => {
    const { useCase, lotRepo } = createUseCase();

    // Both variants of Product A have stock
    lotRepo.setLotsForVariant(VARIANT_A1_ID, [
      makeLot('lot-a1-1', VARIANT_A1_ID, 10, 7),
    ]);
    lotRepo.setLotsForVariant(VARIANT_A2_ID, [
      makeLot('lot-a2-1', VARIANT_A2_ID, 5, 2),
    ]);

    const result = await useCase.execute({ term: 'coke' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matchType).toBe('alias');
    expect(result.value.items).toHaveLength(2);

    const a1Item = result.value.items.find((i) => i.variantId === VARIANT_A1_ID);
    const a2Item = result.value.items.find((i) => i.variantId === VARIANT_A2_ID);
    expect(a1Item!.stock).toBe(7);
    expect(a2Item!.stock).toBe(2);
  });
});
