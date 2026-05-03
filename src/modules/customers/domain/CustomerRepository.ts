/**
 * Repository port for the Customer aggregate.
 *
 * Defined in the domain layer so use cases depend on an interface.
 */
import type { Customer } from './Customer.js';
import type { CustomerId } from './CustomerId.js';

export interface CustomerRepository {
  /** Find a customer by its unique identifier. */
  findById(id: CustomerId): Promise<Customer | null>;

  /** Persist a customer (insert or update). */
  save(customer: Customer): Promise<void>;

  /** Retrieve all customers. */
  findAll(): Promise<Customer[]>;
}
