/**
 * Adjust Inventory Lot use case — handles stock increases, intact-lot edits,
 * and historical-lot compensating adjustments.
 *
 * Runs inside a UnitOfWork transaction to ensure atomicity across
 * inventory lots and adjustment ledger records.
 *
 * Design rules (from design.md):
 * - Intact lots: edit in place when remaining == purchased, no consumption,
 *   no prior adjustments
 * - Historical quantity increase: create new compensation lot; original unchanged
 * - Historical quantity decrease: decrement remaining, record adjustment
 * - Cost correction with remaining > 0: move remaining to new lot at new cost
 * - Exhausted lot cost correction: audit-only, no stock mutation
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError, BusinessRuleError } from '../../../../shared/domain/errors.js';
import { Money } from '../../../../shared/domain/Money.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../../shared/application/UnitOfWork.js';
import type { InventoryLotRepository } from '../../domain/InventoryLotRepository.js';
import type { InventoryLotAdjustmentRepository } from '../../domain/InventoryLotAdjustmentRepository.js';
import type { VariantRepository } from '../../domain/VariantRepository.js';
import { PurchaseLot } from '../../domain/PurchaseLot.js';
import { PurchaseLotId } from '../../domain/PurchaseLotId.js';
import { VariantId } from '../../domain/VariantId.js';
import { PurchaseId } from '../../domain/PurchaseId.js';
import { InventoryLotAdjustment } from '../../domain/InventoryLotAdjustment.js';
import type { AdjustmentAction, AdjustmentSnapshot } from '../../domain/InventoryLotAdjustment.js';
import { isLotIntact } from '../../domain/services/LotAdjustmentPolicy.js';

// ── Module-specific scope ────────────────────────────────────

/**
 * Repositories required by AdjustInventoryLotUseCase on the UnitOfWork scope.
 */
export interface InventoryAdjustmentScope extends UnitOfWorkScope {
  inventoryLots: InventoryLotRepository;
  inventoryLotAdjustments: InventoryLotAdjustmentRepository;
}

// ── DTOs ─────────────────────────────────────────────────────

export interface AdjustInventoryLotCommand {
  action: 'INCREASE' | 'INTACT_EDIT' | 'HISTORICAL_COMPENSATION';
  variantId?: string | undefined;
  lotId?: string;
  quantity?: number | undefined;
  quantityDelta?: number | undefined;
  unitCost?: number | undefined; // in soles
  reason: string;
  effectiveAt?: string | undefined; // ISO date string
  correlationId?: string | null | undefined;
  actorId: string;
  actorSource: string;
}

export interface AdjustInventoryLotResponse {
  adjustmentId: string;
  action: AdjustmentAction;
  variantId: string;
  targetLotId?: string;
  createdLotId?: string | null;
  beforeQuantity: number;
  afterQuantity: number;
  beforeUnitCostCents: number;
  afterUnitCostCents: number;
  deltaQuantity: number;
  reason: string;
  actorId: string;
  actorSource: string;
}

// ── Use Case ─────────────────────────────────────────────────

export class AdjustInventoryLotUseCase {
  constructor(
    private readonly variantRepository: VariantRepository,
  ) {}

  async execute(
    command: AdjustInventoryLotCommand,
    uow: UnitOfWork,
  ): Promise<Result<AdjustInventoryLotResponse>> {
    // ── Pre-transaction validation ──────────────────────────
    const validationErr = this.validateCommand(command);
    if (validationErr) return err(validationErr);

    // ── Execute in transaction ──────────────────────────────
    return uow.run(async (baseScope) => {
      const scope = baseScope as InventoryAdjustmentScope;

      switch (command.action) {
        case 'INCREASE':
          return this.handleIncrease(command, scope);
        case 'INTACT_EDIT':
          return this.handleIntactEdit(command, scope);
        case 'HISTORICAL_COMPENSATION':
          return this.handleHistoricalCompensation(command, scope);
        default:
          return err(new BusinessRuleError(`Acción desconocida: ${(command as { action: string }).action}`));
      }
    });
  }

  // ── Validation ─────────────────────────────────────────────

  private validateCommand(cmd: AdjustInventoryLotCommand): BusinessRuleError | null {
    // Actor identity
    if (!cmd.actorId || cmd.actorId.trim().length === 0) {
      return new BusinessRuleError('La identidad del actor es obligatoria');
    }
    if (!cmd.actorSource || cmd.actorSource.trim().length === 0) {
      return new BusinessRuleError('La fuente del actor es obligatoria');
    }

    // Reason
    if (!cmd.reason || cmd.reason.trim().length === 0) {
      return new BusinessRuleError('El motivo del ajuste es obligatorio');
    }

    // Variant ID (required for INCREASE and INTACT_EDIT; derived from lot for HISTORICAL_COMPENSATION)
    if (cmd.action !== 'HISTORICAL_COMPENSATION') {
      if (!cmd.variantId || cmd.variantId.trim().length === 0) {
        return new BusinessRuleError('El variantId es obligatorio');
      }
    }

    // Effective date
    if (cmd.effectiveAt !== undefined) {
      const d = new Date(cmd.effectiveAt);
      if (isNaN(d.getTime())) {
        return new BusinessRuleError('effectiveAt debe ser una fecha ISO 8601 válida');
      }
    }

    // Action-specific validation
    switch (cmd.action) {
      case 'INCREASE':
        return this.validateIncrease(cmd);
      case 'INTACT_EDIT':
        return this.validateIntactEdit(cmd);
      case 'HISTORICAL_COMPENSATION':
        return this.validateHistoricalCompensation(cmd);
      default:
        return new BusinessRuleError(`Acción inválida: "${String(cmd.action)}"`);
    }
  }

  private validateIncrease(cmd: AdjustInventoryLotCommand): BusinessRuleError | null {
    if (cmd.quantity === undefined) {
      return new BusinessRuleError('La cantidad es obligatoria para INCREASE');
    }
    if (!Number.isInteger(cmd.quantity) || cmd.quantity <= 0) {
      return new BusinessRuleError('La cantidad debe ser un número entero positivo');
    }
    if (cmd.unitCost !== undefined && cmd.unitCost < 0) {
      return new BusinessRuleError('El costo unitario no puede ser negativo');
    }
    return null;
  }

  private validateIntactEdit(cmd: AdjustInventoryLotCommand): BusinessRuleError | null {
    if (!cmd.lotId || cmd.lotId.trim().length === 0) {
      return new BusinessRuleError('El lotId es obligatorio para INTACT_EDIT');
    }
    if (cmd.quantity !== undefined) {
      if (!Number.isInteger(cmd.quantity) || cmd.quantity <= 0) {
        return new BusinessRuleError('La cantidad debe ser un número entero positivo');
      }
    }
    if (cmd.unitCost !== undefined && cmd.unitCost < 0) {
      return new BusinessRuleError('El costo unitario no puede ser negativo');
    }
    if (cmd.quantity === undefined &&
        cmd.unitCost === undefined) {
      return new BusinessRuleError('Se debe proporcionar al menos quantity o unitCost para editar');
    }
    return null;
  }

  private validateHistoricalCompensation(cmd: AdjustInventoryLotCommand): BusinessRuleError | null {
    if (!cmd.lotId || cmd.lotId.trim().length === 0) {
      return new BusinessRuleError('El lotId es obligatorio para HISTORICAL_COMPENSATION');
    }
    if (cmd.quantityDelta === undefined &&
        cmd.unitCost === undefined) {
      return new BusinessRuleError('Se debe proporcionar al menos quantityDelta o unitCost');
    }
    if (cmd.quantityDelta !== undefined) {
      if (!Number.isInteger(cmd.quantityDelta) || cmd.quantityDelta === 0) {
        return new BusinessRuleError('quantityDelta debe ser un número entero distinto de cero');
      }
    }
    if (cmd.unitCost !== undefined && cmd.unitCost < 0) {
      return new BusinessRuleError('El costo unitario no puede ser negativo');
    }
    return null;
  }

    // ── INCREASE handler ───────────────────────────────────────

  private async handleIncrease(
    cmd: AdjustInventoryLotCommand,
    scope: InventoryAdjustmentScope,
  ): Promise<Result<AdjustInventoryLotResponse>> {
    // Narrow required fields (guaranteed by validateCommand)
    if (cmd.variantId === undefined || cmd.quantity === undefined) {
      return err(new BusinessRuleError('Internal: required fields missing after validation'));
    }
    const variantIdStr = cmd.variantId;
    const quantity = cmd.quantity;
    const variantId = VariantId.from(variantIdStr);

    // Validate variant exists
    const variant = await this.variantRepository.findById(variantId);
    if (!variant) {
      return err(new NotFoundError('Variant', variantIdStr));
    }

    const effectiveAt = cmd.effectiveAt ? new Date(cmd.effectiveAt) : new Date();
    const now = new Date();
    const unitCost = cmd.unitCost ?? 0;
    const unitCostCents = Math.round(unitCost * 100);

    // Create new lot
    const lotId = PurchaseLotId.generate();
    const lot = new PurchaseLot(
      lotId,
      variantId,
      PurchaseId.generate(), // standalone increase has its own purchase reference
      quantity,
      quantity,
      Money.fromCents(unitCostCents),
      effectiveAt,
      null,
    );

    // Create audit record
    const snapshot: AdjustmentSnapshot = {
      variantId: variantIdStr,
      lotId: lotId.toString(),
      action: 'INCREASE',
      beforeQuantity: 0,
      afterQuantity: quantity,
      beforeUnitCostCents: 0,
      afterUnitCostCents: unitCostCents,
      deltaQuantity: quantity,
      reason: cmd.reason,
      actorId: cmd.actorId,
      actorSource: cmd.actorSource,
      requestedAt: now,
      effectiveAt,
      correlationId: cmd.correlationId ?? null,
    };

    const adjustment = InventoryLotAdjustment.create(snapshot);

    // Persist
    await scope.inventoryLots.save(lot);
    await scope.inventoryLotAdjustments.save(adjustment);

    return ok({
      adjustmentId: adjustment.id.toString(),
      action: 'INCREASE',
      variantId: variantIdStr,
      targetLotId: lotId.toString(),
      createdLotId: lotId.toString(),
      beforeQuantity: 0,
      afterQuantity: quantity,
      beforeUnitCostCents: 0,
      afterUnitCostCents: unitCostCents,
      deltaQuantity: quantity,
      reason: cmd.reason,
      actorId: cmd.actorId,
      actorSource: cmd.actorSource,
    });
  }

  // ── INTACT_EDIT handler ─────────────────────────────────────

  private async handleIntactEdit(
    cmd: AdjustInventoryLotCommand,
    scope: InventoryAdjustmentScope,
  ): Promise<Result<AdjustInventoryLotResponse>> {
    // Narrow required fields (guaranteed by validateCommand)
    if (cmd.lotId === undefined || cmd.variantId === undefined) {
      return err(new BusinessRuleError('Internal: required fields missing after validation'));
    }
    const lotIdStr = cmd.lotId;
    const variantIdStr = cmd.variantId;
    const lotId = PurchaseLotId.from(lotIdStr);

    // Lock and load the lot
    const lot = await scope.inventoryLots.findByIdForUpdate(lotId);
    if (!lot) {
      return err(new NotFoundError('PurchaseLot', lotIdStr));
    }

    // Check lot belongs to variant
    if (lot.variantId.toString() !== variantIdStr) {
      return err(new NotFoundError('PurchaseLot', lotIdStr));
    }

    // Check intact eligibility
    const hasConsumptions = await scope.inventoryLots.hasConsumptionRecords(lotId);
    const priorAdjustments = await scope.inventoryLotAdjustments.findByLotId(lotId);
    const intact = isLotIntact(lot, hasConsumptions, priorAdjustments.length > 0);

    if (!intact) {
      return err(new BusinessRuleError(
        'El lote no puede editarse directamente porque tiene historial de consumo o ajustes previos. ' +
        'Utilice HISTORICAL_COMPENSATION para lotes históricos.',
      ));
    }

    // Compute new values
    const newQuantity = cmd.quantity ?? lot.purchasedQuantity;
    const newUnitCost = cmd.unitCost !== undefined
      ? Math.round(cmd.unitCost * 100)
      : lot.unitCost.cents;

    const effectiveAt = cmd.effectiveAt ? new Date(cmd.effectiveAt) : new Date();
    const now = new Date();

    // Create updated lot entity (same ID, new values)
    const updatedLot = new PurchaseLot(
      lot.id,
      lot.variantId,
      lot.purchaseId,
      newQuantity,
      newQuantity,
      Money.fromCents(newUnitCost),
      lot.purchaseDate,
      lot.supplierId,
    );

    // Audit record
    const deltaQty = newQuantity - lot.purchasedQuantity;
    const snapshot: AdjustmentSnapshot = {
      variantId: variantIdStr,
      lotId: lotId.toString(),
      action: 'INTACT_EDIT',
      beforeQuantity: lot.purchasedQuantity,
      afterQuantity: newQuantity,
      beforeUnitCostCents: lot.unitCost.cents,
      afterUnitCostCents: newUnitCost,
      deltaQuantity: deltaQty,
      reason: cmd.reason,
      actorId: cmd.actorId,
      actorSource: cmd.actorSource,
      requestedAt: now,
      effectiveAt,
      correlationId: cmd.correlationId ?? null,
    };

    const adjustment = InventoryLotAdjustment.create(snapshot);

    await scope.inventoryLots.save(updatedLot);
    await scope.inventoryLotAdjustments.save(adjustment);

    return ok({
      adjustmentId: adjustment.id.toString(),
      action: 'INTACT_EDIT',
      variantId: variantIdStr,
      targetLotId: lotId.toString(),
      createdLotId: null,
      beforeQuantity: lot.purchasedQuantity,
      afterQuantity: newQuantity,
      beforeUnitCostCents: lot.unitCost.cents,
      afterUnitCostCents: newUnitCost,
      deltaQuantity: deltaQty,
      reason: cmd.reason,
      actorId: cmd.actorId,
      actorSource: cmd.actorSource,
    });
  }

  // ── HISTORICAL_COMPENSATION handler ─────────────────────────

  private async handleHistoricalCompensation(
    cmd: AdjustInventoryLotCommand,
    scope: InventoryAdjustmentScope,
  ): Promise<Result<AdjustInventoryLotResponse>> {
    // Narrow required field (guaranteed by validateCommand)
    if (cmd.lotId === undefined) {
      return err(new BusinessRuleError('Internal: lotId required after validation'));
    }
    const lotIdStr = cmd.lotId;
    const lotId = PurchaseLotId.from(lotIdStr);

    // Lock and load
    const lot = await scope.inventoryLots.findByIdForUpdate(lotId);
    if (!lot) {
      return err(new NotFoundError('PurchaseLot', lotIdStr));
    }

    // Derive variantId from the target lot (not from the transport body).
    // The spec defines this endpoint as POST /inventory/lots/:lotId/adjustments
    // without a mandatory variantId in the body — the lot already carries it.
    const effectiveVariantId = lot.variantId.toString();

    const delta = cmd.quantityDelta ?? 0;
    const hasNewCost = cmd.unitCost !== undefined;
    const newUnitCostCents = cmd.unitCost !== undefined ? Math.round(cmd.unitCost * 100) : lot.unitCost.cents;

    const effectiveAt = cmd.effectiveAt ? new Date(cmd.effectiveAt) : new Date();
    const now = new Date();

    // Compute target lot's new remaining after applying delta
    const newRemaining = lot.remainingQuantity + delta;

    if (newRemaining < 0) {
      return err(new BusinessRuleError(
        `No se puede reducir ${String(Math.abs(delta))} unidades: solo quedan ${String(lot.remainingQuantity)} restantes`,
      ));
    }

    let createdLotId: string | null = null;

    // ── Case: exhausted lot + cost-only correction → audit-only ──
    if (delta === 0 && hasNewCost && lot.remainingQuantity <= 0) {
      const snapshot: AdjustmentSnapshot = {
        variantId: effectiveVariantId,
        lotId: lotId.toString(),
        action: 'HISTORICAL_COMPENSATION',
        beforeQuantity: lot.purchasedQuantity,
        afterQuantity: lot.purchasedQuantity,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: newUnitCostCents,
        deltaQuantity: 0,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
        requestedAt: now,
        effectiveAt,
        correlationId: cmd.correlationId ?? null,
      };

      const adjustment = InventoryLotAdjustment.create(snapshot);
      await scope.inventoryLotAdjustments.save(adjustment);

      return ok({
        adjustmentId: adjustment.id.toString(),
        action: 'HISTORICAL_COMPENSATION',
        variantId: effectiveVariantId,
        targetLotId: lotId.toString(),
        createdLotId: null,
        beforeQuantity: lot.purchasedQuantity,
        afterQuantity: lot.purchasedQuantity,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: newUnitCostCents,
        deltaQuantity: 0,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
      });
    }

    // ── Case: cost correction with positive remaining → move stock to new lot ──
    if (hasNewCost && newRemaining > 0) {
      createdLotId = PurchaseLotId.generate().toString();

      // New compensation lot with corrected cost
      const newLot = new PurchaseLot(
        PurchaseLotId.from(createdLotId),
        lot.variantId,
        PurchaseId.generate(),
        newRemaining,
        newRemaining,
        Money.fromCents(newUnitCostCents),
        effectiveAt,
        lot.supplierId,
      );

      // Zero old lot remaining (stock moved out)
      const zeroedLot = new PurchaseLot(
        lot.id,
        lot.variantId,
        lot.purchaseId,
        lot.purchasedQuantity,
        0,
        lot.unitCost,
        lot.purchaseDate,
        lot.supplierId,
      );

      // Delta on target lot = -lot.remainingQuantity (all remaining moved out)
      const effectiveDelta = -lot.remainingQuantity;

      const snapshot: AdjustmentSnapshot = {
        variantId: effectiveVariantId,
        lotId: lotId.toString(),
        action: 'HISTORICAL_COMPENSATION',
        beforeQuantity: lot.remainingQuantity,
        afterQuantity: 0,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: newUnitCostCents,
        deltaQuantity: effectiveDelta,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
        requestedAt: now,
        effectiveAt,
        correlationId: cmd.correlationId ?? null,
      };

      const adjustment = InventoryLotAdjustment.create(snapshot);
      await scope.inventoryLots.save(zeroedLot);
      await scope.inventoryLots.save(newLot);
      await scope.inventoryLotAdjustments.save(adjustment);

      return ok({
        adjustmentId: adjustment.id.toString(),
        action: 'HISTORICAL_COMPENSATION',
        variantId: effectiveVariantId,
        targetLotId: lotId.toString(),
        createdLotId,
        beforeQuantity: lot.remainingQuantity,
        afterQuantity: 0,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: newUnitCostCents,
        deltaQuantity: effectiveDelta,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
      });
    }

    // ── Case: cost correction with exhausted remaining after delta → audit-only ──
    if (hasNewCost && newRemaining <= 0) {
      // Remaining is already zero or delta exhausted it; audit-only cost correction
      // No stock mutation needed
      const snapshot: AdjustmentSnapshot = {
        variantId: effectiveVariantId,
        lotId: lotId.toString(),
        action: 'HISTORICAL_COMPENSATION',
        beforeQuantity: lot.remainingQuantity,
        afterQuantity: newRemaining,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: newUnitCostCents,
        deltaQuantity: delta,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
        requestedAt: now,
        effectiveAt,
        correlationId: cmd.correlationId ?? null,
      };

      const adjustment = InventoryLotAdjustment.create(snapshot);
      await scope.inventoryLotAdjustments.save(adjustment);

      return ok({
        adjustmentId: adjustment.id.toString(),
        action: 'HISTORICAL_COMPENSATION',
        variantId: effectiveVariantId,
        targetLotId: lotId.toString(),
        createdLotId: null,
        beforeQuantity: lot.remainingQuantity,
        afterQuantity: newRemaining,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: newUnitCostCents,
        deltaQuantity: delta,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
      });
    }

    // ── Case: quantity decrease only (no cost change) ──────────
    if (delta < 0) {
      const updatedLot = new PurchaseLot(
        lot.id,
        lot.variantId,
        lot.purchaseId,
        lot.purchasedQuantity,
        newRemaining,
        lot.unitCost,
        lot.purchaseDate,
        lot.supplierId,
      );

      const snapshot: AdjustmentSnapshot = {
        variantId: effectiveVariantId,
        lotId: lotId.toString(),
        action: 'HISTORICAL_COMPENSATION',
        beforeQuantity: lot.remainingQuantity,
        afterQuantity: newRemaining,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: lot.unitCost.cents,
        deltaQuantity: delta,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
        requestedAt: now,
        effectiveAt,
        correlationId: cmd.correlationId ?? null,
      };

      const adjustment = InventoryLotAdjustment.create(snapshot);
      await scope.inventoryLots.save(updatedLot);
      await scope.inventoryLotAdjustments.save(adjustment);

      return ok({
        adjustmentId: adjustment.id.toString(),
        action: 'HISTORICAL_COMPENSATION',
        variantId: effectiveVariantId,
        targetLotId: lotId.toString(),
        createdLotId: null,
        beforeQuantity: lot.remainingQuantity,
        afterQuantity: newRemaining,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: lot.unitCost.cents,
        deltaQuantity: delta,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
      });
    }

    // ── Case: quantity increase (create new compensation lot) ──
    if (delta > 0) {
      createdLotId = PurchaseLotId.generate().toString();
      const newLot = new PurchaseLot(
        PurchaseLotId.from(createdLotId),
        lot.variantId,
        PurchaseId.generate(),
        delta,
        delta,
        lot.unitCost, // keep same cost unless cost correction was applied above
        effectiveAt,
        lot.supplierId,
      );

      const snapshot: AdjustmentSnapshot = {
        variantId: effectiveVariantId,
        lotId: lotId.toString(),
        action: 'HISTORICAL_COMPENSATION',
        beforeQuantity: lot.remainingQuantity,
        afterQuantity: lot.remainingQuantity + delta,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: lot.unitCost.cents,
        deltaQuantity: delta,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
        requestedAt: now,
        effectiveAt,
        correlationId: cmd.correlationId ?? null,
      };

      const adjustment = InventoryLotAdjustment.create(snapshot);
      await scope.inventoryLots.save(newLot);
      await scope.inventoryLotAdjustments.save(adjustment);

      return ok({
        adjustmentId: adjustment.id.toString(),
        action: 'HISTORICAL_COMPENSATION',
        variantId: effectiveVariantId,
        targetLotId: lotId.toString(),
        createdLotId,
        beforeQuantity: lot.remainingQuantity,
        afterQuantity: lot.remainingQuantity + delta,
        beforeUnitCostCents: lot.unitCost.cents,
        afterUnitCostCents: lot.unitCost.cents,
        deltaQuantity: delta,
        reason: cmd.reason,
        actorId: cmd.actorId,
        actorSource: cmd.actorSource,
      });
    }

    // Fallback (should be unreachable due to validation)
    return err(new BusinessRuleError('Combinación de parámetros no válida para compensación histórica'));
  }
}
