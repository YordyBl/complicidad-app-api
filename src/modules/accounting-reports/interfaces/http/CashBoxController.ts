/**
 * Express controller for Cash Box endpoints.
 *
 * Translates between HTTP request/responses and the cash-box application
 * use cases. No domain logic here — just request parsing, validation,
 * and response shaping.
 *
 * @openapi
 * tags:
 *   - name: Cash Boxes
 *     description: Daily cash box management (caja diaria)
 */
import type { Request, Response } from 'express';
import type { OpenCashBoxUseCase } from '../../application/use-cases/OpenCashBoxUseCase.js';
import type { CloseCashBoxUseCase } from '../../application/use-cases/CloseCashBoxUseCase.js';
import type { GetCurrentCashBoxUseCase } from '../../application/use-cases/GetCurrentCashBoxUseCase.js';
import type { GetCashBoxSummaryUseCase } from '../../application/use-cases/GetCashBoxSummaryUseCase.js';
import type { AddManualMovementUseCase } from '../../application/use-cases/AddManualMovementUseCase.js';
import type { GetCashBoxMovementsUseCase } from '../../application/use-cases/GetCashBoxMovementsUseCase.js';
import type { ReverseMovementUseCase } from '../../application/use-cases/ReverseMovementUseCase.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import { toLimaBusinessDate } from '../../domain/LimaBusinessDate.js';

export class CashBoxController {
  constructor(
    private readonly openCashBoxUseCase: OpenCashBoxUseCase,
    private readonly closeCashBoxUseCase: CloseCashBoxUseCase,
    private readonly getCurrentCashBoxUseCase: GetCurrentCashBoxUseCase,
    private readonly getCashBoxSummaryUseCase: GetCashBoxSummaryUseCase,
    private readonly addManualMovementUseCase: AddManualMovementUseCase,
    private readonly getCashBoxMovementsUseCase: GetCashBoxMovementsUseCase,
    private readonly reverseMovementUseCase: ReverseMovementUseCase,
    private readonly cashBoxRepo: CashBoxRepository,
  ) {}

  // ── GET /cash-boxes/current ──────────────────────────────────

  async getCurrent(_req: Request, res: Response): Promise<void> {
    const result = await this.getCurrentCashBoxUseCase.execute();
    if (!result.ok) {
      res.status(404).json({
        error: result.error.name,
        message: 'No hay una caja abierta para hoy',
      });
      return;
    }
    res.status(200).json(result.value);
  }

  // ── POST /cash-boxes/open ────────────────────────────────────

  async open(_req: Request, res: Response): Promise<void> {
    const todayLima = toLimaBusinessDate(new Date());
    const result = await this.openCashBoxUseCase.execute({
      businessDate: todayLima,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error.name, message: result.error.message });
      return;
    }
    res.status(201).json(result.value);
  }

  // ── POST /cash-boxes/current/close ──────────────────────────

  async close(_req: Request, res: Response): Promise<void> {
    const result = await this.closeCashBoxUseCase.execute({});
    if (!result.ok) {
      res.status(400).json({ error: result.error.name, message: result.error.message });
      return;
    }
    res.status(200).json(result.value);
  }

  // ── GET /cash-boxes ─────────────────────────────────────────

  async list(_req: Request, res: Response): Promise<void> {
    const boxes = await this.cashBoxRepo.findAllOrdered();
    const current = await this.cashBoxRepo.findCurrent();

    const result = boxes.map((box) => ({
      id: box.id.toString(),
      businessDate: box.businessDate,
      status: box.status,
      openingBalanceCents: box.openingBalanceCents,
      currentBalanceCents: box.currentBalanceCents,
      finalBalanceCents: box.finalBalanceCents,
      closedAt: box.closedAt,
      legacy: box.legacy,
      isCurrent: current !== null && current.id.toString() === box.id.toString(),
    }));

    res.status(200).json(result);
  }

  // ── GET /cash-boxes/:id ──────────────────────────────────────

  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de caja es obligatorio' });
      return;
    }

    const result = await this.getCashBoxSummaryUseCase.execute({
      cashBoxId: id,
    });
    if (!result.ok) {
      res.status(404).json({ error: result.error.name, message: result.error.message });
      return;
    }
    res.status(200).json(result.value);
  }

  // ── POST /cash-boxes/current/movements ──────────────────────

  async addMovement(req: Request, res: Response): Promise<void> {
    const { concept, amountCents, type } = req.body as Record<string, unknown>;

    if (typeof concept !== 'string' || typeof amountCents !== 'number' || typeof type !== 'string') {
      res.status(400).json({
        error: 'ValidationError',
        message: 'concept, amountCents y type son obligatorios',
      });
      return;
    }

    const result = await this.addManualMovementUseCase.execute({
      concept,
      amountCents,
      type: type as 'MANUAL_ADJUSTMENT' | 'WITHDRAWAL',
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error.name, message: result.error.message });
      return;
    }
    res.status(201).json(result.value);
  }

  // ── GET /cash-boxes/:id/movements ──────────────────────────

  async getMovements(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string | undefined;
    if (!id) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID de caja es obligatorio' });
      return;
    }
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const result = await this.getCashBoxMovementsUseCase.execute({
      cashBoxId: id,
      ...(page !== undefined && { page }),
      ...(pageSize !== undefined && { pageSize }),
      ...(type !== undefined && { type }),
      ...(search !== undefined && { search }),
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
    });
    if (!result.ok) {
      res.status(404).json({ error: result.error.name, message: result.error.message });
      return;
    }
    res.status(200).json(result.value);
  }

  // ── POST /cash-boxes/current/movements/:movementId/reverse ─

  async reverseMovement(req: Request, res: Response): Promise<void> {
    const movementId = req.params.movementId as string | undefined;
    if (!movementId) {
      res.status(400).json({ error: 'ValidationError', message: 'El ID del movimiento es obligatorio' });
      return;
    }

    const result = await this.reverseMovementUseCase.execute({
      movementId,
    });
    if (!result.ok) {
      const status = result.error.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: result.error.name, message: result.error.message });
      return;
    }
    res.status(200).json(result.value);
  }
}
