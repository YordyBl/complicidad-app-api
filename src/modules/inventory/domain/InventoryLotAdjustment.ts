/**
 * Immutable audit record for an inventory lot adjustment.
 *
 * Every correction — increase, intact edit, or historical compensation —
 * produces one of these records. Once written, it MUST never be mutated.
 * New corrections create NEW rows.
 *
 * This is a domain value object. The `create` factory validates invariants
 * and freezes the resulting instance.
 */
import { DomainError } from '../../../shared/domain/errors.js';
import { InventoryLotAdjustmentId } from './InventoryLotAdjustmentId.js';

// ── Action types ─────────────────────────────────────────────

export type AdjustmentAction = 'INCREASE' | 'INTACT_EDIT' | 'HISTORICAL_COMPENSATION';

const VALID_ACTIONS = new Set<AdjustmentAction>(['INCREASE', 'INTACT_EDIT', 'HISTORICAL_COMPENSATION']);

// ── Snapshot ─────────────────────────────────────────────────

export interface AdjustmentSnapshot {
  variantId: string;
  lotId: string | null;
  action: AdjustmentAction;
  beforeQuantity: number;
  afterQuantity: number;
  beforeUnitCostCents: number;
  afterUnitCostCents: number;
  deltaQuantity: number;
  reason: string;
  actorId: string;
  actorSource: string;
  requestedAt: Date;
  effectiveAt: Date;
  correlationId: string | null;
}

// ── Error ────────────────────────────────────────────────────

export class InventoryLotAdjustmentError extends DomainError {
  override readonly name = 'InventoryLotAdjustmentError';
}

// ── Entity ───────────────────────────────────────────────────

export class InventoryLotAdjustment {
  private constructor(
    public readonly id: InventoryLotAdjustmentId,
    public readonly snapshot: AdjustmentSnapshot,
    public readonly createdAt: Date,
  ) {}

  static create(snapshot: AdjustmentSnapshot): InventoryLotAdjustment {
    // Validate action type
    if (!VALID_ACTIONS.has(snapshot.action)) {
      throw new InventoryLotAdjustmentError(
        `Acción de ajuste inválida: "${snapshot.action}". Las válidas son: ${[...VALID_ACTIONS].join(', ')}`,
      );
    }

    // Validate reason
    if (!snapshot.reason || snapshot.reason.trim().length === 0) {
      throw new InventoryLotAdjustmentError('El motivo del ajuste es obligatorio');
    }

    // Validate actor identity
    if (!snapshot.actorId || snapshot.actorId.trim().length === 0) {
      throw new InventoryLotAdjustmentError('La identidad del actor es obligatoria');
    }

    if (!snapshot.actorSource || snapshot.actorSource.trim().length === 0) {
      throw new InventoryLotAdjustmentError('La fuente del actor es obligatoria');
    }

    // Validate delta matches before-after quantities
    const expectedDelta = snapshot.afterQuantity - snapshot.beforeQuantity;
    if (snapshot.deltaQuantity !== expectedDelta) {
      throw new InventoryLotAdjustmentError(
        `Delta de cantidad inconsistente: esperado ${String(expectedDelta)}, recibido ${String(snapshot.deltaQuantity)}`,
      );
    }

    // Validate quantities are non-negative
    if (snapshot.beforeQuantity < 0) {
      throw new InventoryLotAdjustmentError('beforeQuantity no puede ser negativo');
    }

    if (snapshot.afterQuantity < 0) {
      throw new InventoryLotAdjustmentError('afterQuantity no puede ser negativo');
    }

    // Validate timestamps
    if (!(snapshot.requestedAt instanceof Date) || isNaN(snapshot.requestedAt.getTime())) {
      throw new InventoryLotAdjustmentError('requestedAt debe ser una fecha válida');
    }

    if (!(snapshot.effectiveAt instanceof Date) || isNaN(snapshot.effectiveAt.getTime())) {
      throw new InventoryLotAdjustmentError('effectiveAt debe ser una fecha válida');
    }

    const adjustment = new InventoryLotAdjustment(
      InventoryLotAdjustmentId.generate(),
      { ...snapshot },
      new Date(),
    );

    return Object.freeze(adjustment);
  }

  /**
   * Reconstitute from persistence (bypasses validation — assumes DB integrity).
   */
  static fromPersistence(
    id: InventoryLotAdjustmentId,
    snapshot: AdjustmentSnapshot,
    createdAt: Date,
  ): InventoryLotAdjustment {
    const adjustment = new InventoryLotAdjustment(id, { ...snapshot }, createdAt);
    return Object.freeze(adjustment);
  }
}
