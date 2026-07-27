/**
 * Express controller for report and cash closing endpoints.
 *
 * Translates between HTTP request/responses and the application use cases.
 * No domain logic here — just request parsing, validation, and response shaping.
 *
 * Maps internal DTO field names to canonical frontend-facing HTTP contract
 * field names at this boundary.
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
import { normalizeReportListQuery } from '../../infrastructure/typeorm/ReportQueryAdapter.js';

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
  // Canonical: { liquidityCents: number; currency: 'ARS' }

  async liquidity(_req: Request, res: Response): Promise<void> {
    const result = await this.getLiquidityUseCase.execute();
    res.status(200).json({
      liquidityCents: result.liquidityCents,
      currency: result.currency,
    });
  }

  // ── GET /reports/stock-investment ───────────────────────────
  // Canonical: { totalInvestmentCents: number; currency: 'ARS' }

  async stockInvestment(_req: Request, res: Response): Promise<void> {
    const result = await this.getStockInvestmentUseCase.execute();
    res.status(200).json({
      totalInvestmentCents: result.stockInvestmentCents,
      currency: result.currency,
    });
  }

  // ── GET /reports/sales-total ────────────────────────────────
  // Canonical: { totalSalesCents: number; currency: 'ARS'; activeSaleCount: number }

  async salesTotal(_req: Request, res: Response): Promise<void> {
    const result = await this.getSalesTotalUseCase.execute();
    res.status(200).json({
      totalSalesCents: result.salesIncomeCents,
      currency: result.currency,
      activeSaleCount: result.activeSaleCount,
    });
  }

  // ── GET /reports/fifo-cogs ──────────────────────────────────
  // Canonical: { totalCogsCents: number; currency: 'ARS' }

  async fifoCosts(_req: Request, res: Response): Promise<void> {
    const result = await this.getFifoCostsUseCase.execute();
    res.status(200).json({
      totalCogsCents: result.fifoCostsCents,
      currency: result.currency,
    });
  }

  // ── GET /reports/gross-profit ───────────────────────────────
  // Canonical: { grossProfitCents: number; currency: 'ARS' }

  async grossProfit(_req: Request, res: Response): Promise<void> {
    const result = await this.getGrossProfitUseCase.execute();
    res.status(200).json({
      grossProfitCents: result.grossProfitCents,
      currency: result.currency,
    });
  }

  // ── GET /reports/reinvestment ───────────────────────────────
  // Canonical: { reinvestmentCents: number; currency: 'ARS' }

  async reinvestment(_req: Request, res: Response): Promise<void> {
    const result = await this.getReinvestmentUseCase.execute();
    res.status(200).json({
      reinvestmentCents: result.reinvestmentCents,
      currency: result.currency,
    });
  }

  // ── GET /reports/operating-capital ──────────────────────────
  // Canonical: { operatingCapitalCents: number; currency: 'ARS' }

  async operatingCapital(_req: Request, res: Response): Promise<void> {
    const result = await this.getOperatingCapitalUseCase.execute();
    res.status(200).json({
      operatingCapitalCents: result.operatingCapitalCents,
      currency: result.currency,
    });
  }

  // ── GET /reports/stock-by-product ───────────────────────────
  // Canonical: PaginatedResponse<StockByProductItem> with query defaults

  async stockByProduct(req: Request, res: Response): Promise<void> {
    const rawQuery = req.query as Record<string, unknown>;
    const query = normalizeReportListQuery(rawQuery);
    const result = await this.getStockByProductUseCase.execute(query);
    res.status(200).json(result);
  }

  // ── GET /reports/lots ───────────────────────────────────────
  // Canonical: PaginatedResponse<LotReportItem> with query defaults

  async lots(req: Request, res: Response): Promise<void> {
    const rawQuery = req.query as Record<string, unknown>;
    const query = normalizeReportListQuery(rawQuery);
    const result = await this.getLotsUseCase.execute(query);
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
