/**
 * Express controller for report and cash closing endpoints.
 *
 * Translates between HTTP request/responses and the application use cases.
 * No domain logic here — just request parsing, validation, and response shaping.
 */
import type { Request, Response } from 'express';
import type { GetLiquidityUseCase } from '../../application/use-cases/GetLiquidityUseCase.js';
import type { GetStockInvestmentUseCase } from '../../application/use-cases/GetStockInvestmentUseCase.js';
import type { GetSalesTotalUseCase } from '../../application/use-cases/GetSalesTotalUseCase.js';
import type { GetFifoCostsUseCase } from '../../application/use-cases/GetFifoCostsUseCase.js';
import type { GetGrossProfitUseCase } from '../../application/use-cases/GetGrossProfitUseCase.js';
import type { GetReinvestmentUseCase } from '../../application/use-cases/GetReinvestmentUseCase.js';
import type { GetOperatingCapitalUseCase } from '../../application/use-cases/GetOperatingCapitalUseCase.js';
import type { GetStockByProductUseCase } from '../../application/use-cases/GetStockByProductUseCase.js';
import type { GetLotsUseCase } from '../../application/use-cases/GetLotsUseCase.js';
import type { ManualCashCloseUseCase } from '../../application/use-cases/ManualCashCloseUseCase.js';

export class ReportController {
  constructor(
    private readonly getLiquidityUseCase: GetLiquidityUseCase,
    private readonly getStockInvestmentUseCase: GetStockInvestmentUseCase,
    private readonly getSalesTotalUseCase: GetSalesTotalUseCase,
    private readonly getFifoCostsUseCase: GetFifoCostsUseCase,
    private readonly getGrossProfitUseCase: GetGrossProfitUseCase,
    private readonly getReinvestmentUseCase: GetReinvestmentUseCase,
    private readonly getOperatingCapitalUseCase: GetOperatingCapitalUseCase,
    private readonly getStockByProductUseCase: GetStockByProductUseCase,
    private readonly getLotsUseCase: GetLotsUseCase,
    private readonly manualCashCloseUseCase: ManualCashCloseUseCase,
  ) {}

  // ── GET /reports/liquidity ──────────────────────────────────

  async liquidity(_req: Request, res: Response): Promise<void> {
    const result = await this.getLiquidityUseCase.execute();
    res.status(200).json(result);
  }

  // ── GET /reports/stock-investment ───────────────────────────

  async stockInvestment(_req: Request, res: Response): Promise<void> {
    const result = await this.getStockInvestmentUseCase.execute();
    res.status(200).json(result);
  }

  // ── GET /reports/sales-total ────────────────────────────────

  async salesTotal(_req: Request, res: Response): Promise<void> {
    const result = await this.getSalesTotalUseCase.execute();
    res.status(200).json(result);
  }

  // ── GET /reports/fifo-cogs ──────────────────────────────────

  async fifoCosts(_req: Request, res: Response): Promise<void> {
    const result = await this.getFifoCostsUseCase.execute();
    res.status(200).json(result);
  }

  // ── GET /reports/gross-profit ───────────────────────────────

  async grossProfit(_req: Request, res: Response): Promise<void> {
    const result = await this.getGrossProfitUseCase.execute();
    res.status(200).json(result);
  }

  // ── GET /reports/reinvestment ───────────────────────────────

  async reinvestment(_req: Request, res: Response): Promise<void> {
    const result = await this.getReinvestmentUseCase.execute();
    res.status(200).json(result);
  }

  // ── GET /reports/operating-capital ──────────────────────────

  async operatingCapital(_req: Request, res: Response): Promise<void> {
    const result = await this.getOperatingCapitalUseCase.execute();
    res.status(200).json(result);
  }

  // ── GET /reports/stock-by-product ───────────────────────────

  async stockByProduct(_req: Request, res: Response): Promise<void> {
    const result = await this.getStockByProductUseCase.execute();
    res.status(200).json(result);
  }

  // ── GET /reports/lots ───────────────────────────────────────

  async lots(_req: Request, res: Response): Promise<void> {
    const result = await this.getLotsUseCase.execute();
    res.status(200).json(result);
  }

  // ── POST /cash/closings ─────────────────────────────────────

  async cashClose(req: Request, res: Response): Promise<void> {
    const { notes } = req.body as Record<string, unknown>;

    const result = await this.manualCashCloseUseCase.execute({
      notes: typeof notes === 'string' ? notes : null,
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(201).json(result.value);
  }
}
