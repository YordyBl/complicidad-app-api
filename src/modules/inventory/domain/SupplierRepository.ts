/**
 * Repository port for the Supplier aggregate.
 *
 * Defined in the domain layer so use cases depend on an interface.
 */
import type { Supplier } from './Supplier.js';
import type { SupplierId } from './SupplierId.js';

export interface SupplierRepository {
  /** Find a supplier by its unique identifier. */
  findById(id: SupplierId): Promise<Supplier | null>;

  /** Persist a supplier (insert or update). */
  save(supplier: Supplier): Promise<void>;

  /** Delete a supplier by id. */
  delete(id: SupplierId): Promise<void>;

  /** Return all active suppliers. */
  findAllActive(): Promise<Supplier[]>;
}
