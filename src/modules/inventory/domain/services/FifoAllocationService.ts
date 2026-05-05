/**
 * Pure domain service for FIFO (First-In-First-Out) lot allocation.
 *
 * Given a list of PurchaseLots and a requested quantity, selects
 * which lots to consume from, starting with the oldest received lot.
 *
 * This is a stateless function — no side effects, no mutations.
 * The caller is responsible for persisting the consumption.
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import { Money } from '../../../../shared/domain/Money.js';
import type { PurchaseLot } from '../PurchaseLot.js';

// ── Types ────────────────────────────────────────────────────

export interface LotSelection {
  lotId: string;
  quantity: number;
  unitCost: Money;
  subtotal: Money;
}

export interface FifoAllocationResult {
  /** The selected lots and quantities to consume, in FIFO order. */
  selections: LotSelection[];
  /** Total cost across all selected lots. */
  totalCost: Money;
}

// ── Error ────────────────────────────────────────────────────

export class InsufficientStockError extends BusinessRuleError {
  override readonly name = 'InsufficientStockError' as const;

  constructor(requested: number, available: number) {
    super(`Stock insuficiente: se solicitaron ${String(requested)} unidades, pero solo hay ${String(available)} disponibles`);
  }
}

// ── Service ──────────────────────────────────────────────────

/**
 * Allocate a quantity of stock across lots using FIFO ordering.
 *
 * Lots are consumed in order of purchase date (oldest first).
 * Exhausted lots (remainingQuantity === 0) are skipped.
 *
 * @param lots - Available PurchaseLots for a given variant, sorted
 *               by purchase date (oldest first is convention).
 * @param requestedQuantity - The number of units to allocate.
 * @returns Ok(FifoAllocationResult) or Err(InsufficientStockError).
 */
export function allocateFifo(
  lots: PurchaseLot[],
  requestedQuantity: number,
): Result<FifoAllocationResult, InsufficientStockError> {
  if (requestedQuantity < 0) {
    return err(new InsufficientStockError(requestedQuantity, 0));
  }

  if (requestedQuantity === 0) {
    return ok({
      selections: [],
      totalCost: Money.ZERO,
    });
  }

  // Filter only open lots with remaining quantity, sorted by purchase date
  const openLots = lots
    .filter((l) => !l.isExhausted)
    .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());

  // Calculate total available stock
  const totalAvailable = openLots.reduce((sum, l) => sum + l.remainingQuantity, 0);

  if (totalAvailable < requestedQuantity) {
    return err(new InsufficientStockError(requestedQuantity, totalAvailable));
  }

  const selections: LotSelection[] = [];
  let remaining = requestedQuantity;

  for (const lot of openLots) {
    if (remaining <= 0) break;

    const take = Math.min(remaining, lot.remainingQuantity);
    selections.push({
      lotId: lot.id.toString(),
      quantity: take,
      unitCost: lot.unitCost,
      subtotal: lot.unitCost.multiply(take),
    });

    remaining -= take;
  }

  const totalCost = selections.reduce(
    (sum, s) => sum.add(s.subtotal),
    Money.ZERO,
  );

  return ok({ selections, totalCost });
}
