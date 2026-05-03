/**
 * Express controller for sale endpoints.
 *
 * Translates between HTTP request/responses and the application use cases.
 * No domain logic here — just request parsing, validation, and response shaping.
 */
import type { Request, Response } from 'express';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { CreateSaleUseCase } from '../../application/use-cases/CreateSaleUseCase.js';
import type { CancelSaleUseCase } from '../../application/use-cases/CancelSaleUseCase.js';
import type { ReturnFullSaleUseCase } from '../../application/use-cases/ReturnFullSaleUseCase.js';

export class SaleController {
  constructor(
    private readonly createSaleUseCase: CreateSaleUseCase,
    private readonly cancelSaleUseCase: CancelSaleUseCase,
    private readonly returnFullSaleUseCase: ReturnFullSaleUseCase,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * POST /sales — create a multi-item sale.
   */
  async create(req: Request, res: Response): Promise<void> {
    const { customerId, channelReference, items } = req.body as Record<string, unknown>;

    if (typeof customerId !== 'string') {
      res.status(400).json({ error: 'ValidationError', message: 'customerId is required and must be a string' });
      return;
    }
    if (typeof channelReference !== 'string') {
      res.status(400).json({ error: 'ValidationError', message: 'channelReference is required and must be a string' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'ValidationError', message: 'items must be a non-empty array' });
      return;
    }

    // Validate each item
    const parsedItems: { variantId: string; quantity: number; unitPriceCents: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Record<string, unknown> | undefined;
      if (!item || typeof item.variantId !== 'string' || typeof item.quantity !== 'number' || typeof item.unitPriceCents !== 'number') {
        res.status(400).json({
          error: 'ValidationError',
          message: `items[${String(i)}] must have variantId (string), quantity (number), and unitPriceCents (number)`,
        });
        return;
      }
      parsedItems.push({ variantId: item.variantId, quantity: item.quantity, unitPriceCents: item.unitPriceCents });
    }

    const result = await this.createSaleUseCase.execute(
      { customerId, channelReference, items: parsedItems },
      this.uow,
    );

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(201).json(result.value);
  }

  /**
   * POST /sales/:id/cancel — cancel an active sale.
   */
  async cancel(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'Sale ID is required' });
      return;
    }

    const result = await this.cancelSaleUseCase.execute({ saleId: id }, this.uow);

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }

  /**
   * POST /sales/:id/return — return a full sale.
   */
  async returnSale(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'Sale ID is required' });
      return;
    }

    const result = await this.returnFullSaleUseCase.execute({ saleId: id }, this.uow);

    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }
}
