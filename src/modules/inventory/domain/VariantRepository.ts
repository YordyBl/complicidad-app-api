/**
 * Repository port for the Variant entity.
 *
 * Defined in the domain layer so use cases depend on an interface.
 * SKU uniqueness is enforced at the persistence boundary via
 * database unique constraint.
 */
import type { Variant } from './Variant.js';
import type { VariantId } from './VariantId.js';
import type { ProductId } from './ProductId.js';
import type { Sku } from './Sku.js';

export interface VariantRepository {
  /** Find a variant by its unique identifier. */
  findById(id: VariantId): Promise<Variant | null>;

  /** Find a variant by its SKU (unique constraint). */
  findBySku(sku: Sku): Promise<Variant | null>;

  /** Find all variants for a given product. */
  findByProductId(productId: ProductId): Promise<Variant[]>;

  /** Persist a variant (insert or update). */
  save(variant: Variant): Promise<void>;

  /** Delete a variant by id. */
  delete(id: VariantId): Promise<void>;
}
