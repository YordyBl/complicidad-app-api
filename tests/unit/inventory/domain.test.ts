/**
 * Unit tests for inventory domain value objects and entities.
 *
 * Tests SKU validation, alias normalization, product/variant creation,
 * and entity invariants.
 */
import { describe, it, expect } from 'vitest';
import { Sku, SkuError } from '../../../src/modules/inventory/domain/Sku.js';
import { Alias, AliasError } from '../../../src/modules/inventory/domain/Alias.js';
import { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import { Product } from '../../../src/modules/inventory/domain/Product.js';
import { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import { Variant } from '../../../src/modules/inventory/domain/Variant.js';
import { SupplierId } from '../../../src/modules/inventory/domain/SupplierId.js';
import { Supplier } from '../../../src/modules/inventory/domain/Supplier.js';
import { PurchaseId } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { Purchase } from '../../../src/modules/inventory/domain/Purchase.js';
import { Money } from '../../../src/shared/domain/Money.js';

// ── SKU ──────────────────────────────────────────────────────

describe('Sku', () => {
  describe('creation', () => {
    it('creates from a valid SKU string', () => {
      const result = Sku.from('COLA-500ML');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.value).toBe('COLA-500ML');
    });

    it('normalizes to uppercase', () => {
      const result = Sku.from('cola-500ml');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.value).toBe('COLA-500ML');
    });

    it('trims whitespace', () => {
      const result = Sku.from('  SKU-001  ');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.value).toBe('SKU-001');
    });

    it('rejects empty strings', () => {
      const result = Sku.from('');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SkuError);
    });

    it('rejects whitespace-only strings', () => {
      const result = Sku.from('   ');
      expect(result.ok).toBe(false);
    });

    it('rejects overly long SKUs', () => {
      const long = 'A'.repeat(101);
      const result = Sku.from(long);
      expect(result.ok).toBe(false);
    });

    it('accepts SKUs at max length', () => {
      const max = 'A'.repeat(100);
      const result = Sku.from(max);
      expect(result.ok).toBe(true);
    });
  });

  describe('equality', () => {
    it('two SKUs with same value are equal', () => {
      const a = Sku.from('SKU-001');
      const b = Sku.from('sku-001');
      expect(a.ok && b.ok && a.value.equals(b.value)).toBe(true);
    });

    it('different SKUs are not equal', () => {
      const a = Sku.from('SKU-001');
      const b = Sku.from('SKU-002');
      expect(a.ok && b.ok && a.value.equals(b.value)).toBe(false);
    });
  });
});

// ── Alias ────────────────────────────────────────────────────

describe('Alias', () => {
  it('creates from a valid alias string', () => {
    const result = Alias.from('Coca Cola');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('coca cola');
  });

  it('lowercases the alias', () => {
    const result = Alias.from('COCA COLA');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('coca cola');
  });

  it('trims whitespace', () => {
    const result = Alias.from('  Coke  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('coke');
  });

  it('rejects empty strings', () => {
    const result = Alias.from('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(AliasError);
  });

  it('two aliases with the same value are equal', () => {
    const a = Alias.from('Coke');
    const b = Alias.from('coke');
    expect(a.ok && b.ok && a.value.equals(b.value)).toBe(true);
  });
});

// ── Product ──────────────────────────────────────────────────

describe('Product', () => {
  const now = new Date('2025-01-01');

  function createProduct(): Product {
    return new Product(
      ProductId.generate(),
      'Test Product',
      'A test product',
      Money.fromCents(1000), // $10.00
      [],
      true,
      now,
      now,
    );
  }

  it('creates with given values', () => {
    const p = createProduct();
    expect(p.name).toBe('Test Product');
    expect(p.description).toBe('A test product');
    expect(p.basePrice.cents).toBe(1000);
    expect(p.isActive).toBe(true);
    expect(p.aliases).toHaveLength(0);
  });

  it('can be deactivated and reactivated', () => {
    const p = createProduct();
    p.deactivate();
    expect(p.isActive).toBe(false);
    p.activate();
    expect(p.isActive).toBe(true);
  });

  it('supports adding and removing aliases', () => {
    const p = createProduct();
    const alias = Alias.from('coke');
    expect(alias.ok).toBe(true);
    if (!alias.ok) return;

    p.addAlias(alias.value);
    expect(p.aliases).toHaveLength(1);
    expect(p.aliases[0]!.value).toBe('coke');

    // Duplicate alias is not added again
    p.addAlias(alias.value);
    expect(p.aliases).toHaveLength(1);

    // Remove alias
    p.removeAlias(alias.value);
    expect(p.aliases).toHaveLength(0);
  });

  it('can change base price', () => {
    const p = createProduct();
    p.changeBasePrice(Money.fromCents(2000));
    expect(p.basePrice.cents).toBe(2000);
  });
});

// ── Variant ──────────────────────────────────────────────────

describe('Variant', () => {
  const now = new Date('2025-01-01');
  const productId = ProductId.generate();

  function createVariant(): Variant {
    const sku = Sku.from('TEST-SKU');
    if (!sku.ok) throw new Error('Invalid SKU');
    return new Variant(
      VariantId.generate(),
      productId,
      sku.value,
      { color: 'red', size: 'M' },
      Money.fromCents(1500),
      true,
      now,
      now,
    );
  }

  it('creates with given values', () => {
    const v = createVariant();
    expect(v.productId.equals(productId)).toBe(true);
    expect(v.sku.value).toBe('TEST-SKU');
    expect(v.attributes.color).toBe('red');
    expect(v.attributes.size).toBe('M');
    expect(v.price.cents).toBe(1500);
  });

  it('can change SKU', () => {
    const v = createVariant();
    const newSku = Sku.from('NEW-SKU');
    expect(newSku.ok).toBe(true);
    if (!newSku.ok) return;
    v.changeSku(newSku.value);
    expect(v.sku.value).toBe('NEW-SKU');
  });

  it('can change price', () => {
    const v = createVariant();
    v.changePrice(Money.fromCents(2000));
    expect(v.price.cents).toBe(2000);
  });

  it('supports attribute management', () => {
    const v = createVariant();
    v.setAttribute('weight', '500g');
    expect(v.attributes.weight).toBe('500g');
    v.removeAttribute('color');
    expect(v.attributes.color).toBeUndefined();
  });

  it('can be deactivated', () => {
    const v = createVariant();
    v.deactivate();
    expect(v.isActive).toBe(false);
    v.activate();
    expect(v.isActive).toBe(true);
  });
});

// ── Supplier ─────────────────────────────────────────────────

describe('Supplier', () => {
  const now = new Date('2025-01-01');

  it('creates with given values', () => {
    const s = new Supplier(
      SupplierId.generate(),
      'Test Supplier',
      '+123456789',
      true,
      now,
      now,
    );
    expect(s.name).toBe('Test Supplier');
    expect(s.contactInfo).toBe('+123456789');
    expect(s.isActive).toBe(true);
  });

  it('can be created without contact info', () => {
    const s = new Supplier(
      SupplierId.generate(),
      'No Contact',
      null,
      true,
      now,
      now,
    );
    expect(s.contactInfo).toBeNull();
  });
});

// ── Purchase ─────────────────────────────────────────────────

describe('Purchase', () => {
  it('creates with given values', () => {
    const purchaseDate = new Date('2025-06-01');
    const p = new Purchase(
      PurchaseId.generate(),
      null,
      'Initial stock',
      purchaseDate,
      new Date('2025-06-01'),
    );
    expect(p.notes).toBe('Initial stock');
    expect(p.supplierId).toBeNull();
    expect(p.purchaseDate).toEqual(purchaseDate);
  });
});

// ── SKU Uniqueness via Repository (contract) ─────────────────

describe('SKU uniqueness contract', () => {
  it('VariantRepository.findBySku should be the single source of truth for SKU uniqueness', () => {
    // This test documents the contract: SKU uniqueness is enforced at the
    // persistence boundary (database unique constraint + VariantRepository.findBySku).
    // The domain entity does NOT enforce it — that's the repository's job.
    const sku = Sku.from('UNIQUE-SKU');
    expect(sku.ok).toBe(true);
    if (!sku.ok) return;

    // Two variants CAN have the same SKU in memory (domain allows it).
    // The database will reject the second one via unique constraint.
    const now = new Date();
    const productId = ProductId.generate();
    const v1 = new Variant(VariantId.generate(), productId, sku.value, {}, Money.ZERO, true, now, now);
    const v2 = new Variant(VariantId.generate(), productId, sku.value, {}, Money.ZERO, true, now, now);

    // Domain doesn't prevent this — both exist in memory
    expect(v1.sku.equals(v2.sku)).toBe(true);

    // Repository layer validates uniqueness via findBySku before persisting
    // and the DB has a UNIQUE constraint on the sku column
  });
});
