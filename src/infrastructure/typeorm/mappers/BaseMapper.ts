/**
 * Base mapper interface for converting between domain entities and
 * TypeORM persistence entities.
 *
 * Keeping domain entities pure means TypeORM entity classes never
 * appear in domain logic. Mappers bridge the gap at the infrastructure
 * boundary.
 *
 * @example
 * ```ts
 * class ProductMapper implements BaseMapper<Product, ProductEntity> {
 *   toDomain(entity: ProductEntity): Product {
 *     return new Product({ /* ... * / });
 *   }
 *   toPersistence(domain: Product): ProductEntity {
 *     const entity = new ProductEntity();
 *     // ... map fields
 *     return entity;
 *   }
 * }
 * ```
 */
export interface BaseMapper<TDomain, TPersistence> {
  /** Convert a persistence entity to a domain entity. */
  toDomain(persistence: TPersistence): TDomain;

  /** Convert a domain entity to a persistence entity. */
  toPersistence(domain: TDomain): TPersistence;
}
