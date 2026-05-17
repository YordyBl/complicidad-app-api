/**
 * Express controller for inventory operational endpoints.
 *
 * Covers purchase registration (stock intake), lot adjustments,
 * and inventory correction flows. Translates between HTTP
 * request/responses and the application use cases.
 */
import type { Request, Response } from 'express';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { RegisterPurchaseUseCase, RegisterPurchaseCommand } from '../../application/use-cases/RegisterPurchaseUseCase.js';
import type { AdjustInventoryLotUseCase, AdjustInventoryLotCommand } from '../../application/use-cases/AdjustInventoryLotUseCase.js';
import type { ActorContextResolver } from './ActorContextResolver.js';

export class InventoryController {
  constructor(
    private readonly registerPurchaseUseCase: RegisterPurchaseUseCase,
    private readonly uow: UnitOfWork,
    private readonly adjustInventoryLotUseCase?: AdjustInventoryLotUseCase,
    private readonly actorContextResolver?: ActorContextResolver,
  ) {}

  /**
   * POST /purchases — register a batch stock purchase.
   *
   * Accepts `items[]` with variantId, quantity, and unitCost per item.
   * Shared metadata (supplierId, notes, purchaseDate) applies to all items.
   */
  async registerPurchase(req: Request, res: Response): Promise<void> {
    const { items, supplierId, notes, purchaseDate } =
      req.body as Record<string, unknown>;

    // ── Validate items array ────────────────────────────────
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'ValidationError', message: 'items es obligatorio y debe ser un array no vacío' });
      return;
    }

    // ── Validate each item ──────────────────────────────────
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Record<string, unknown> | undefined;
      if (!item || typeof item !== 'object') {
        res.status(400).json({ error: 'ValidationError', message: `items[${String(i)}] debe ser un objeto` });
        return;
      }
      if (typeof item.variantId !== 'string') {
        res.status(400).json({ error: 'ValidationError', message: `items[${String(i)}].variantId es obligatorio y debe ser un string` });
        return;
      }
      if (typeof item.quantity !== 'number' || typeof item.unitCost !== 'number') {
        res.status(400).json({ error: 'ValidationError', message: `items[${String(i)}].quantity y unitCost deben ser números` });
        return;
      }
    }

    const itemsMapped: RegisterPurchaseCommand['items'] = items.map(
      (item: Record<string, unknown>) => ({
        variantId: item.variantId as string,
        quantity: item.quantity as number,
        unitCost: item.unitCost as number,
      }),
    );

    const result = await this.registerPurchaseUseCase.execute(
      {
        items: itemsMapped,
        ...(typeof supplierId === 'string' ? { supplierId } : {}),
        ...(typeof notes === 'string' ? { notes } : {}),
        ...(typeof purchaseDate === 'string' ? { purchaseDate } : {}),
      },
      this.uow,
    );

    if (!result.ok) {
      // NotFoundError → 404, others → 400
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(201).json(result.value);
  }

  // ── Actor resolution helper ─────────────────────────────────

  /**
   * Resolve actor identity from request headers.
   * Returns the actor identity or sends a 400 response and returns null.
   */
  private resolveActor(req: Request, res: Response): { actorId: string; actorSource: string } | null {
    if (!this.actorContextResolver) {
      res.status(503).json({ error: 'ServiceUnavailable', message: 'Resolvedor de identidad no configurado' });
      return null;
    }

    const actorResult = this.actorContextResolver.resolve(req.headers);
    if (!actorResult.ok) {
      res.status(400).json({ error: actorResult.error.name, message: actorResult.error.message });
      return null;
    }

    return actorResult.value;
  }

  // ── Guard helper ────────────────────────────────────────────

  /**
   * Returns the adjustment use case if wired, otherwise sends 503 and returns null.
   */
  private guardAdjustUseCase(res: Response): AdjustInventoryLotUseCase | null {
    if (!this.adjustInventoryLotUseCase) {
      res.status(503).json({ error: 'ServiceUnavailable', message: 'Ajuste de inventario no configurado' });
      return null;
    }
    return this.adjustInventoryLotUseCase;
  }

  // ── Transport validation helpers ────────────────────────────

  private sendValidationError(res: Response, message: string): void {
    res.status(400).json({ error: 'ValidationError', message });
  }

  // ── POST /inventory/lots/adjustments/increase ───────────────

  /**
   * POST /inventory/lots/adjustments/increase
   *
   * Register a stock increase for a variant. Creates a new lot.
   * Body: { variantId, quantity, unitCost?, reason, effectiveAt?, correlationId? }
   */
  async adjustIncrease(req: Request, res: Response): Promise<void> {
    const useCase = this.guardAdjustUseCase(res);
    if (!useCase) return;

    const actor = this.resolveActor(req, res);
    if (!actor) return;

    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      this.sendValidationError(res, 'El cuerpo de la solicitud es obligatorio');
      return;
    }

    // Validate variantId
    if (typeof body.variantId !== 'string' || body.variantId.trim().length === 0) {
      this.sendValidationError(res, 'variantId es obligatorio y debe ser un string no vacío');
      return;
    }

    // Validate quantity
    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity <= 0) {
      this.sendValidationError(res, 'quantity debe ser un número entero positivo');
      return;
    }

    // Validate unitCost if present
    if (body.unitCost !== undefined && body.unitCost !== null) {
      if (typeof body.unitCost !== 'number' || body.unitCost < 0) {
        this.sendValidationError(res, 'unitCost debe ser un número no negativo');
        return;
      }
    }

    // Validate reason
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      this.sendValidationError(res, 'reason es obligatorio y debe ser un string no vacío');
      return;
    }

    // Validate effectiveAt if present
    if (body.effectiveAt !== undefined && body.effectiveAt !== null) {
      if (typeof body.effectiveAt !== 'string' || isNaN(Date.parse(body.effectiveAt))) {
        this.sendValidationError(res, 'effectiveAt debe ser una fecha ISO 8601 válida');
        return;
      }
    }

    const command: AdjustInventoryLotCommand = {
      action: 'INCREASE',
      variantId: body.variantId,
      quantity: body.quantity,
      unitCost: typeof body.unitCost === 'number' ? body.unitCost : undefined,
      reason: body.reason,
      effectiveAt: typeof body.effectiveAt === 'string' ? body.effectiveAt : undefined,
      correlationId: typeof body.correlationId === 'string' ? body.correlationId : undefined,
      actorId: actor.actorId,
      actorSource: actor.actorSource,
    };

    const result = await useCase.execute(command, this.uow);

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(201).json(result.value);
  }

  // ── PATCH /inventory/lots/:lotId (intact edit) ───────────────

  /**
   * PATCH /inventory/lots/:lotId
   *
   * Direct-edit an intact lot (no consumption history, no prior adjustments).
   * Body: { variantId, quantity?, unitCost?, reason, effectiveAt? }
   */
  async patchLot(req: Request, res: Response): Promise<void> {
    const useCase = this.guardAdjustUseCase(res);
    if (!useCase) return;

    const actor = this.resolveActor(req, res);
    if (!actor) return;

    const rawLotId = req.params.lotId as string | undefined;
    if (!rawLotId || rawLotId.trim().length === 0) {
      this.sendValidationError(res, 'lotId es obligatorio en la ruta');
      return;
    }
    const lotId = rawLotId.trim();

    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      this.sendValidationError(res, 'El cuerpo de la solicitud es obligatorio');
      return;
    }

    // Validate variantId
    if (typeof body.variantId !== 'string' || body.variantId.trim().length === 0) {
      this.sendValidationError(res, 'variantId es obligatorio y debe ser un string no vacío');
      return;
    }

    // Validate quantity if present
    if (body.quantity !== undefined && body.quantity !== null) {
      if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity <= 0) {
        this.sendValidationError(res, 'quantity debe ser un número entero positivo');
        return;
      }
    }

    // Validate unitCost if present
    if (body.unitCost !== undefined && body.unitCost !== null) {
      if (typeof body.unitCost !== 'number' || body.unitCost < 0) {
        this.sendValidationError(res, 'unitCost debe ser un número no negativo');
        return;
      }
    }

    // At least one of quantity or unitCost must be provided
    const hasQuantity = body.quantity !== undefined && body.quantity !== null;
    const hasUnitCost = body.unitCost !== undefined && body.unitCost !== null;
    if (!hasQuantity && !hasUnitCost) {
      this.sendValidationError(res, 'Se debe proporcionar al menos quantity o unitCost para editar');
      return;
    }

    // Validate reason
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      this.sendValidationError(res, 'reason es obligatorio y debe ser un string no vacío');
      return;
    }

    // Validate effectiveAt if present
    if (body.effectiveAt !== undefined && body.effectiveAt !== null) {
      if (typeof body.effectiveAt !== 'string' || isNaN(Date.parse(body.effectiveAt))) {
        this.sendValidationError(res, 'effectiveAt debe ser una fecha ISO 8601 válida');
        return;
      }
    }

    const command: AdjustInventoryLotCommand = {
      action: 'INTACT_EDIT',
      variantId: body.variantId,
      lotId,
      quantity: typeof body.quantity === 'number' ? body.quantity : undefined,
      unitCost: typeof body.unitCost === 'number' ? body.unitCost : undefined,
      reason: body.reason,
      effectiveAt: typeof body.effectiveAt === 'string' ? body.effectiveAt : undefined,
      correlationId: typeof body.correlationId === 'string' ? body.correlationId : undefined,
      actorId: actor.actorId,
      actorSource: actor.actorSource,
    };

    const result = await useCase.execute(command, this.uow);

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }

  // ── POST /inventory/lots/:lotId/adjustments ──────────────────

  /**
   * POST /inventory/lots/:lotId/adjustments
   *
   * Historical compensation for a lot with consumption/return/adjustment history.
   * Body: { quantityDelta?, unitCost?, reason, effectiveAt?, correlationId? }
   */
  async adjustHistorical(req: Request, res: Response): Promise<void> {
    const useCase = this.guardAdjustUseCase(res);
    if (!useCase) return;

    const actor = this.resolveActor(req, res);
    if (!actor) return;

    const rawLotId = req.params.lotId as string | undefined;
    if (!rawLotId || rawLotId.trim().length === 0) {
      this.sendValidationError(res, 'lotId es obligatorio en la ruta');
      return;
    }
    const lotId = rawLotId.trim();

    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      this.sendValidationError(res, 'El cuerpo de la solicitud es obligatorio');
      return;
    }

    // Validate quantityDelta if present
    if (body.quantityDelta !== undefined && body.quantityDelta !== null) {
      if (typeof body.quantityDelta !== 'number' || !Number.isInteger(body.quantityDelta) || body.quantityDelta === 0) {
        this.sendValidationError(res, 'quantityDelta debe ser un número entero distinto de cero');
        return;
      }
    }

    // Validate unitCost if present
    if (body.unitCost !== undefined && body.unitCost !== null) {
      if (typeof body.unitCost !== 'number' || body.unitCost < 0) {
        this.sendValidationError(res, 'unitCost debe ser un número no negativo');
        return;
      }
    }

    // At least one of quantityDelta or unitCost must be provided
    const hasDelta = body.quantityDelta !== undefined && body.quantityDelta !== null;
    const hasUnitCost = body.unitCost !== undefined && body.unitCost !== null;
    if (!hasDelta && !hasUnitCost) {
      this.sendValidationError(res, 'Se debe proporcionar al menos quantityDelta o unitCost');
      return;
    }

    // Validate reason
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      this.sendValidationError(res, 'reason es obligatorio y debe ser un string no vacío');
      return;
    }

    // Validate effectiveAt if present
    if (body.effectiveAt !== undefined && body.effectiveAt !== null) {
      if (typeof body.effectiveAt !== 'string' || isNaN(Date.parse(body.effectiveAt))) {
        this.sendValidationError(res, 'effectiveAt debe ser una fecha ISO 8601 válida');
        return;
      }
    }

    const command: AdjustInventoryLotCommand = {
      action: 'HISTORICAL_COMPENSATION',
      // variantId is intentionally left undefined — the use case derives it from the lot
      variantId: typeof body.variantId === 'string' ? body.variantId : undefined,
      lotId,
      quantityDelta: typeof body.quantityDelta === 'number' ? body.quantityDelta : undefined,
      unitCost: typeof body.unitCost === 'number' ? body.unitCost : undefined,
      reason: body.reason,
      effectiveAt: typeof body.effectiveAt === 'string' ? body.effectiveAt : undefined,
      correlationId: typeof body.correlationId === 'string' ? body.correlationId : undefined,
      actorId: actor.actorId,
      actorSource: actor.actorSource,
    };

    const result = await useCase.execute(command, this.uow);

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }
}
