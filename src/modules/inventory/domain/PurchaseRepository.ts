/**
 * Repository port for the Purchase aggregate.
 *
 * Defined in the domain layer so use cases depend on an interface.
 */
import type { Purchase } from './Purchase.js';
import type { PurchaseId } from './PurchaseId.js';

export interface PurchaseRepository {
  /** Find a purchase by its unique identifier. */
  findById(id: PurchaseId): Promise<Purchase | null>;

  /** Persist a purchase (insert or update). */
  save(purchase: Purchase): Promise<void>;

  /** Delete a purchase by id. */
  delete(id: PurchaseId): Promise<void>;
}
