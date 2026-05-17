/**
 * Pure domain service for determining whether an inventory lot is intact
 * (eligible for direct in-place editing) or historical (requires compensating
 * adjustment through the immutable ledger).
 *
 * An intact lot:
 * - Has not been partially or fully consumed (remainingQuantity == purchasedQuantity)
 * - Has no consumption records (sales, returns, cancellations referencing it)
 * - Has no prior adjustment records referencing it
 *
 * Historical lots require append-only compensating adjustments.
 */
import type { PurchaseLot } from '../PurchaseLot.js';

export function isLotIntact(
  lot: PurchaseLot,
  hasConsumptionRecords: boolean,
  hasPriorAdjustments: boolean,
): boolean {
  if (hasConsumptionRecords) return false;
  if (hasPriorAdjustments) return false;
  return lot.remainingQuantity === lot.purchasedQuantity;
}
