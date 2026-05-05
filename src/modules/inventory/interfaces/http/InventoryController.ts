/**
 * Express controller for inventory operational endpoints.
 *
 * Covers purchase registration (stock intake) and supplier management.
 * Translates between HTTP request/responses and the application use cases.
 */
import type { Request, Response } from 'express';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { RegisterPurchaseUseCase, RegisterPurchaseCommand } from '../../application/use-cases/RegisterPurchaseUseCase.js';

export class InventoryController {
  constructor(
    private readonly registerPurchaseUseCase: RegisterPurchaseUseCase,
    private readonly uow: UnitOfWork,
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
}
