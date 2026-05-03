/**
 * TypeORM-backed implementation of the CustomerRepository port.
 *
 * Phase 8: Added findAll method.
 */
import { Repository, type EntityManager } from 'typeorm';
import type { CustomerRepository } from '../../domain/CustomerRepository.js';
import type { Customer } from '../../domain/Customer.js';
import type { CustomerId } from '../../domain/CustomerId.js';
import { CustomerEntity } from './CustomerEntity.js';
import { CustomerMapper } from './CustomerMapper.js';

export class CustomerTypeOrmRepository implements CustomerRepository {
  private readonly repo: Repository<CustomerEntity>;
  private readonly mapper = new CustomerMapper();

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(CustomerEntity);
  }

  async findById(id: CustomerId): Promise<Customer | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async save(customer: Customer): Promise<void> {
    const entity = this.mapper.toPersistence(customer);
    await this.repo.save(entity);
  }

  async findAll(): Promise<Customer[]> {
    const entities = await this.repo.find({ order: { createdAt: 'ASC' } });
    return entities.map((e) => this.mapper.toDomain(e));
  }
}
