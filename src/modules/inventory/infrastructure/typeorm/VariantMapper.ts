/**
 * Mapper between the domain `Variant` and the TypeORM `VariantEntity`.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { Variant } from '../../domain/Variant.js';
import { VariantId } from '../../domain/VariantId.js';
import { ProductId } from '../../domain/ProductId.js';
import { Sku } from '../../domain/Sku.js';
import { Money } from '../../../../shared/domain/Money.js';
import { VariantEntity } from './VariantEntity.js';

export class VariantMapper implements BaseMapper<Variant, VariantEntity> {
  toDomain(entity: VariantEntity): Variant {
    return new Variant(
      VariantId.from(entity.id),
      ProductId.from(entity.productId),
      Sku.fromUnsafe(entity.sku),
      entity.attributes,
      Money.fromCents(entity.priceCents),
      entity.isActive,
      entity.createdAt,
      entity.updatedAt,
    );
  }

  toPersistence(domain: Variant): VariantEntity {
    const entity = new VariantEntity();
    entity.id = domain.id.toString();
    entity.productId = domain.productId.toString();
    entity.sku = domain.sku.toString();
    entity.attributes = { ...domain.attributes };
    entity.priceCents = domain.price.cents;
    entity.isActive = domain.isActive;
    return entity;
  }
}
