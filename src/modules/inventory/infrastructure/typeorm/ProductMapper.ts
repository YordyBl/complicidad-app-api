/**
 * Mapper between the domain `Product` and the TypeORM `ProductEntity`.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { Product } from '../../domain/Product.js';
import { ProductId } from '../../domain/ProductId.js';
import { Alias } from '../../domain/Alias.js';
import { Money } from '../../../../shared/domain/Money.js';
import { ProductEntity } from './ProductEntity.js';

export class ProductMapper implements BaseMapper<Product, ProductEntity> {
  toDomain(entity: ProductEntity): Product {
    const aliases = (entity.aliases ?? []).map((a) => Alias.fromUnsafe(a));
    return new Product(
      ProductId.from(entity.id),
      entity.name,
      entity.description,
      entity.baseSku,
      Money.fromCents(entity.salePriceCents),
      entity.presalePriceCents != null
        ? Money.fromCents(entity.presalePriceCents)
        : null,
      aliases,
      entity.isActive,
      entity.createdAt,
      entity.updatedAt,
    );
  }

  toPersistence(domain: Product): ProductEntity {
    const entity = new ProductEntity();
    entity.id = domain.id.toString();
    entity.name = domain.name;
    entity.description = domain.description;
    entity.baseSku = domain.baseSku;
    entity.salePriceCents = domain.salePrice.cents;
    entity.presalePriceCents = domain.presalePrice !== null ? domain.presalePrice.cents : null;
    entity.aliases = domain.aliases.map((a) => a.toString());
    entity.isActive = domain.isActive;
    return entity;
  }
}
