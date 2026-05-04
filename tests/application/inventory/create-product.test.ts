/**
 * Application tests for CreateProductUseCase.
 *
 * Tests the use case with fake repositories. Verifies:
 * - Product creation with auto-generated variants from sizes
 * - SKU generation from baseSku + size (e.g., "sku-test" + "M" → "sku-test-m")
 * - SKU uniqueness validation after normalization (lowercase collision)
 * - Required fields validation (empty baseSku, empty sizes)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateProductUseCase,
  SkuAlreadyExistsError,
  EmptySizesError,
  InvalidBaseSkuError,
} from '../../../src/modules/inventory/application/use-cases/CreateProductUseCase.js';
import type {
  CreateProductCommand,
} from '../../../src/modules/inventory/application/use-cases/CreateProductUseCase.js';
import type { ProductRepository } from '../../../src/modules/inventory/domain/ProductRepository.js';
import type { VariantRepository } from '../../../src/modules/inventory/domain/VariantRepository.js';
import type { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import type { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import type { Sku } from '../../../src/modules/inventory/domain/Sku.js';
import { Product } from '../../../src/modules/inventory/domain/Product.js';
import { Variant } from '../../../src/modules/inventory/domain/Variant.js';
import { Sku as SkuEntity } from '../../../src/modules/inventory/domain/Sku.js';
import { VariantId as VariantIdEntity } from '../../../src/modules/inventory/domain/VariantId.js';
import { ProductId as ProductIdEntity } from '../../../src/modules/inventory/domain/ProductId.js';

// ── Fakes ────────────────────────────────────────────────────

class FakeProductRepository implements ProductRepository {
  products = new Map<string, Product>();

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

class FakeVariantRepository implements VariantRepository {
  variants = new Map<string, Variant>();

  /** Convenience method to seed test data before use-case execution. */
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

  async delete(_id: VariantId): Promise<void> {
    // no-op
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('CreateProductUseCase', () => {
  let productRepo: FakeProductRepository;
  let variantRepo: FakeVariantRepository;
  let useCase: CreateProductUseCase;

  beforeEach(() => {
    productRepo = new FakeProductRepository();
    variantRepo = new FakeVariantRepository();
    useCase = new CreateProductUseCase(productRepo, variantRepo);
  });

  // ── Test 1: SKU generation from baseSku + size ──────────────

  describe('variant SKU generation', () => {
    it('generates variant SKUs from baseSku + size (lowercase normalized)', async () => {
      const command: CreateProductCommand = {
        name: 'Test Product',
        baseSku: 'sku-test',
        salePrice: 15.0,
        sizes: ['M', 'L', 'XL'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Verify product was persisted
      expect(productRepo.products.size).toBe(1);

      // Verify variants were persisted
      expect(variantRepo.variants.size).toBe(3);
      expect(result.value.variantIds).toHaveLength(3);

      // Verify generated SKUs
      const variants = Array.from(variantRepo.variants.values());
      const skus = variants.map((v) => v.sku.value).sort();
      expect(skus).toEqual(['sku-test-l', 'sku-test-m', 'sku-test-xl']);
    });

    it('generates SKU from baseSku + size correctly for single size', async () => {
      const command: CreateProductCommand = {
        name: 'Single Size Product',
        baseSku: 'sku-test',
        salePrice: 10.0,
        sizes: ['M'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const variants = Array.from(variantRepo.variants.values());
      expect(variants).toHaveLength(1);
      expect(variants[0]!.sku.value).toBe('sku-test-m');
    });

    it('lowercases baseSku regardless of input casing', async () => {
      const command: CreateProductCommand = {
        name: 'Cased Product',
        baseSku: 'SKU-TEST',
        salePrice: 10.0,
        sizes: ['XL'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const variants = Array.from(variantRepo.variants.values());
      expect(variants[0]!.sku.value).toBe('sku-test-xl');
    });

    it('normalizes special characters in baseSku to dashes', async () => {
      const command: CreateProductCommand = {
        name: 'Special Chars Product',
        baseSku: 'SKU TEST',
        salePrice: 10.0,
        sizes: ['M'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const variants = Array.from(variantRepo.variants.values());
      // SKU TEST → sku-test → sku-test-m
      expect(variants[0]!.sku.value).toBe('sku-test-m');
    });
  });

  // ── Test 2: SKU uniqueness after normalization ──────────────

  describe('SKU uniqueness validation after normalization', () => {
    it('rejects duplicate SKU when existing variant has same normalized SKU', async () => {
      // Pre-populate with a variant that has SKU "shoe-m"
      const existingSkuResult = SkuEntity.from('shoe-m');
      expect(existingSkuResult.ok).toBe(true);
      if (!existingSkuResult.ok) return;

      const existingVariant = new Variant(
        VariantIdEntity.generate(),
        ProductIdEntity.generate(),
        existingSkuResult.value,
        { size: 'M' },
        true,
        new Date('2025-01-01'),
        new Date('2025-01-01'),
      );
      variantRepo.setVariant(existingVariant);

      // Try to create product with baseSku "SHOE" + size "M" that would
      // normalize to "shoe-m" (collision with existing)
      const command: CreateProductCommand = {
        name: 'Shoe Product',
        baseSku: 'SHOE',
        salePrice: 50.0,
        sizes: ['M'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SkuAlreadyExistsError);
      expect(result.error.message).toContain('already exists');
    });

    it('rejects when existing variant has same SKU regardless of input casing', async () => {
      // Similar to above but test that casing of the NEW input doesn't matter
      const existingSkuResult = SkuEntity.from('SHOE-M');
      expect(existingSkuResult.ok).toBe(true);
      if (!existingSkuResult.ok) return;

      const existingVariant = new Variant(
        VariantIdEntity.generate(),
        ProductIdEntity.generate(),
        existingSkuResult.value,
        { size: 'M' },
        true,
        new Date('2025-01-01'),
        new Date('2025-01-01'),
      );
      variantRepo.setVariant(existingVariant);

      // Base SKU "shoe" + size "M" normalizes to "shoe-m" — same as existing "SHOE-M"
      const command: CreateProductCommand = {
        name: 'Shoe Product Lower',
        baseSku: 'shoe',
        salePrice: 50.0,
        sizes: ['M'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SkuAlreadyExistsError);
    });
  });

  // ── Validation ──────────────────────────────────────────────

  describe('validation', () => {
    it('rejects empty baseSku', async () => {
      const command: CreateProductCommand = {
        name: 'No SKU Product',
        baseSku: '',
        salePrice: 10.0,
        sizes: ['M'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidBaseSkuError);
    });

    it('rejects whitespace-only baseSku', async () => {
      const command: CreateProductCommand = {
        name: 'Whitespace SKU',
        baseSku: '   ',
        salePrice: 10.0,
        sizes: ['M'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidBaseSkuError);
    });

    it('rejects empty sizes list', async () => {
      const command: CreateProductCommand = {
        name: 'No Sizes Product',
        baseSku: 'sku-test',
        salePrice: 10.0,
        sizes: [],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(EmptySizesError);
    });

    it('rejects sizes with empty strings (trimmed out)', async () => {
      const command: CreateProductCommand = {
        name: 'Empty Size',
        baseSku: 'sku-test',
        salePrice: 10.0,
        sizes: ['', '  ', '\t'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(EmptySizesError);
    });

    it('creates product with aliases', async () => {
      const command: CreateProductCommand = {
        name: 'Aliased Product',
        baseSku: 'prod-alias',
        salePrice: 20.0,
        sizes: ['S'],
        aliases: ['nickname1', 'nickname2'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const product = Array.from(productRepo.products.values())[0]!;
      expect(product.aliases.map((a) => a.value)).toEqual(
        expect.arrayContaining(['nickname1', 'nickname2']),
      );
    });

    it('creates product with presale price', async () => {
      const command: CreateProductCommand = {
        name: 'Presale Product',
        baseSku: 'presale-test',
        salePrice: 100.0,
        presalePrice: 80.0,
        sizes: ['M'],
      };

      const result = await useCase.execute(command);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const product = Array.from(productRepo.products.values())[0]!;
      expect(product.presalePrice).not.toBeNull();
      expect(product.presalePrice!.cents).toBe(8000); // 80.00 soles
      expect(product.salePrice.cents).toBe(10000); // 100.00 soles
    });
  });
});
