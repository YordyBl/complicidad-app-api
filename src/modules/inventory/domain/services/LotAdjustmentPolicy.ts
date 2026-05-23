/**
 * Pure domain service for determining whether an inventory lot is intact
 * (eligible for direct in-place editing) or historical (requires compensating
 * adjustment through the immutable ledger).
 *
 * An intact lot:
 * - Has not been partially or fully consumed (remainingQuantity == purchasedQuantity)
 * - Has no consumption records (sales, returns, cancellations referencing it)
 * - Has no corrective adjustment records (creation INCREASE audit with
 *   beforeQuantity=0 is NOT corrective — it is the initial creation record)
 *
 * Historical lots require append-only compensating adjustments.
 */
import type { PurchaseLot } from '../PurchaseLot.js';

/**
 * Lightweight adjustment snapshot needed only to determine if an adjustment
 * is a creation audit or a corrective action.
 */
export interface CreatableAdjustmentSnapshot {
  action: string;
  beforeQuantity: number;
}

export function isLotIntact(
  lot: PurchaseLot,
  hasConsumptionRecords: boolean,
  hasPriorAdjustments: boolean,
): boolean {
  if (hasConsumptionRecords) return false;
  if (hasPriorAdjustments) return false;
  return lot.remainingQuantity === lot.purchasedQuantity;
}

/**
 * Check whether any of the given adjustments are corrective (i.e. NOT
 * the initial creation INCREASE audit where beforeQuantity === 0).
 *
 * The initial creation audit is produced by the INCREASE use case when
 * a new lot is first created. That record should NOT prevent the lot
 * from being considered intact.
 *
 * @returns true if at least one adjustment is corrective (historical)
 */
export function hasCorrectiveAdjustments(
  adjustments: readonly CreatableAdjustmentSnapshot[],
): boolean {
  return adjustments.some(
    (a) => !(a.action === 'INCREASE' && a.beforeQuantity === 0),
  );
}
