/**
 * Mapper between the domain `Supplier` and the TypeORM `SupplierEntity`.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { Supplier } from '../../domain/Supplier.js';
import { SupplierId } from '../../domain/SupplierId.js';
import { SupplierEntity } from './SupplierEntity.js';

export class SupplierMapper implements BaseMapper<Supplier, SupplierEntity> {
  toDomain(entity: SupplierEntity): Supplier {
    return new Supplier(
      SupplierId.from(entity.id),
      entity.name,
      entity.contactInfo,
      entity.isActive,
      entity.createdAt,
      entity.updatedAt,
    );
  }

  toPersistence(domain: Supplier): SupplierEntity {
    const entity = new SupplierEntity();
    entity.id = domain.id.toString();
    entity.name = domain.name;
    entity.contactInfo = domain.contactInfo;
    entity.isActive = domain.isActive;
    return entity;
  }
}
