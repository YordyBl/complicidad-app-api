/**
 * Repository port for InventoryLotAdjustment persistence.
 *
 * The adjustment ledger is append-only — adjustments are never mutated
 * or deleted once written. This repository provides query and save operations
 * scoped within the Unit of Work transaction.
 */
import type { InventoryLotAdjustment } from './InventoryLotAdjustment.js';
import type { InventoryLotAdjustmentId } from './InventoryLotAdjustmentId.js';
import type { PurchaseLotId } from './PurchaseLotId.js';
import type { VariantId } from './VariantId.js';

export interface InventoryLotAdjustmentRepository {
  /** Persist a new adjustment row. */
  save(adjustment: InventoryLotAdjustment): Promise<void>;

  /** Find adjustments that reference a specific lot (for intact-edit eligibility check). */
  findByLotId(lotId: PurchaseLotId): Promise<InventoryLotAdjustment[]>;

  /** Find adjustments that reference a specific variant (for audit trail). */
  findByVariantId(variantId: VariantId): Promise<InventoryLotAdjustment[]>;

  /** Find a single adjustment by its id. */
  findById(id: InventoryLotAdjustmentId): Promise<InventoryLotAdjustment | null>;
}
