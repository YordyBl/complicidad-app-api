/**
 * Repository port for PurchaseLot (FIFO inventory lot) persistence.
 *
 * Defined in the domain layer so use cases depend on an interface.
 * The `findByVariantIdOrderedByDate` method provides lots sorted
 * by purchase date (oldest first) for FIFO allocation, with optional
 * row-locking for concurrency control.
 */
import type { PurchaseLot } from './PurchaseLot.js';
import type { PurchaseLotId } from './PurchaseLotId.js';
import type { VariantId } from './VariantId.js';

export interface InventoryLotRepository {
  /** Find a lot by its unique identifier. */
  findById(id: PurchaseLotId): Promise<PurchaseLot | null>;

  /** Find multiple lots by their unique identifiers. */
  findByIds(ids: PurchaseLotId[]): Promise<PurchaseLot[]>;

  /**
   * Find all lots for a given variant, ordered by purchase date
   * ascending (oldest first) for FIFO consumption.
   *
   * @param variantId - The variant to find lots for.
   * @param lock - When true, acquires a row-level lock (FOR UPDATE)
   *               for concurrency-safe consumption.
   */
  findByVariantIdOrderedByDate(variantId: VariantId, lock?: boolean): Promise<PurchaseLot[]>;

  /**
   * Persist a lot (insert or update).
   * Used after consumption to update remainingQuantity.
   */
  save(lot: PurchaseLot): Promise<void>;

  /** Persist multiple lots in a single batch. */
  saveMany(lots: PurchaseLot[]): Promise<void>;

  /** Delete a lot by id. */
  delete(id: PurchaseLotId): Promise<void>;
}
