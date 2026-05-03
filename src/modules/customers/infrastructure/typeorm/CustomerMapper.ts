/**
 * Mapper between the domain `Customer` and the TypeORM `CustomerEntity`.
 *
 * Phase 8: Added alias, address, googleMapsUrl, notes.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { Customer } from '../../domain/Customer.js';
import { CustomerId } from '../../domain/CustomerId.js';
import { CustomerEntity } from './CustomerEntity.js';

export class CustomerMapper implements BaseMapper<Customer, CustomerEntity> {
  toDomain(entity: CustomerEntity): Customer {
    return new Customer(
      CustomerId.from(entity.id),
      entity.name,
      entity.email,
      entity.phone,
      entity.alias,
      entity.address,
      entity.googleMapsUrl,
      entity.notes,
      entity.createdAt,
      entity.updatedAt,
    );
  }

  toPersistence(domain: Customer): CustomerEntity {
    const entity = new CustomerEntity();
    entity.id = domain.id.toString();
    entity.name = domain.name;
    entity.email = domain.email;
    entity.phone = domain.phone;
    entity.alias = domain.alias;
    entity.address = domain.address;
    entity.googleMapsUrl = domain.googleMapsUrl;
    entity.notes = domain.notes;
    return entity;
  }
}
