/**
 * Express controller for inventory operational endpoints.
 *
 * Covers purchase registration (stock intake) and supplier management.
 * Translates between HTTP request/responses and the application use cases.
 */
import type { Request, Response } from 'express';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { RegisterPurchaseUseCase } from '../../application/use-cases/RegisterPurchaseUseCase.js';

export class InventoryController {
  constructor(
    private readonly registerPurchaseUseCase: RegisterPurchaseUseCase,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * POST /purchases — register a new stock purchase (creates FIFO lots + cash outflow).
   */
  async registerPurchase(req: Request, res: Response): Promise<void> {
    const { variantId, quantity, unitCostCents, supplierId, notes, purchaseDate } =
      req.body as Record<string, unknown>;

    if (typeof variantId !== 'string') {
      res.status(400).json({ error: 'ValidationError', message: 'variantId is required and must be a string' });
      return;
    }
    if (typeof quantity !== 'number' || typeof unitCostCents !== 'number') {
      res.status(400).json({ error: 'ValidationError', message: 'quantity and unitCostCents must be numbers' });
      return;
    }

    const result = await this.registerPurchaseUseCase.execute(
      {
        variantId,
        quantity,
        unitCostCents,
        supplierId: typeof supplierId === 'string' ? supplierId : undefined,
        notes: typeof notes === 'string' ? notes : undefined,
        purchaseDate: typeof purchaseDate === 'string' ? purchaseDate : undefined,
      } as Parameters<typeof this.registerPurchaseUseCase.execute>[0],
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
