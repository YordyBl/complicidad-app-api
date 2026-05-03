/**
 * Repository port for the Product aggregate.
 *
 * Defined in the domain layer so use cases depend on an interface,
 * not on TypeORM or any other infrastructure library.
 */
import type { Product } from './Product.js';
import type { ProductId } from './ProductId.js';

export interface ProductRepository {
  /** Find a product by its unique identifier. */
  findById(id: ProductId): Promise<Product | null>;

  /** Find products by alias (case-insensitive search). */
  findByAlias(alias: string): Promise<Product[]>;

  /** Persist a product (insert or update). */
  save(product: Product): Promise<void>;

  /** Delete a product by id. */
  delete(id: ProductId): Promise<void>;

  /** Return all active products. */
  findAllActive(): Promise<Product[]>;
}
