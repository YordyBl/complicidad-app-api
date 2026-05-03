/**
 * Accounting / Reports module composition root.
 *
 * Wires the domain, application, infrastructure, and HTTP layers together.
 * Called from the server bootstrap once the DataSource is available.
 */
import { Router } from 'express';
import type { EntityManager } from 'typeorm';
import { CashClosingTypeOrmRepository } from './infrastructure/typeorm/CashClosingTypeOrmRepository.js';
import { ReportQueryAdapter } from './infrastructure/typeorm/ReportQueryAdapter.js';
import { ManualCashCloseUseCase } from './application/use-cases/ManualCashCloseUseCase.js';
import { GetLiquidityUseCase } from './application/use-cases/GetLiquidityUseCase.js';
import { GetStockInvestmentUseCase } from './application/use-cases/GetStockInvestmentUseCase.js';
import { GetSalesTotalUseCase } from './application/use-cases/GetSalesTotalUseCase.js';
import { GetFifoCostsUseCase } from './application/use-cases/GetFifoCostsUseCase.js';
import { GetGrossProfitUseCase } from './application/use-cases/GetGrossProfitUseCase.js';
import { GetReinvestmentUseCase } from './application/use-cases/GetReinvestmentUseCase.js';
import { GetOperatingCapitalUseCase } from './application/use-cases/GetOperatingCapitalUseCase.js';
import { GetStockByProductUseCase } from './application/use-cases/GetStockByProductUseCase.js';
import { GetLotsUseCase } from './application/use-cases/GetLotsUseCase.js';
import { ReportController } from './interfaces/http/ReportController.js';
import { createReportRouter } from './interfaces/http/report-routes.js';

/**
 * Create and wire the accounting/reports module, returning an Express Router.
 *
 * @param manager - TypeORM EntityManager (from DataSource) or `undefined`.
 */
export function createAccountingModule(manager?: EntityManager): Router {
  if (!manager) {
    const router = Router();
    router.all('*', (_req, res) => {
      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'Database not connected — report endpoints unavailable',
      });
    });
    return router;
  }

  // Infrastructure
  const reportRepo = new ReportQueryAdapter(manager);
  const cashClosingRepo = new CashClosingTypeOrmRepository(manager);

  // Application use cases
  const getLiquidityUseCase = new GetLiquidityUseCase(reportRepo);
  const getStockInvestmentUseCase = new GetStockInvestmentUseCase(reportRepo);
  const getSalesTotalUseCase = new GetSalesTotalUseCase(reportRepo);
  const getFifoCostsUseCase = new GetFifoCostsUseCase(reportRepo);
  const getGrossProfitUseCase = new GetGrossProfitUseCase(reportRepo);
  const getReinvestmentUseCase = new GetReinvestmentUseCase(reportRepo);
  const getOperatingCapitalUseCase = new GetOperatingCapitalUseCase(reportRepo);
  const getStockByProductUseCase = new GetStockByProductUseCase(reportRepo);
  const getLotsUseCase = new GetLotsUseCase(reportRepo);
  const manualCashCloseUseCase = new ManualCashCloseUseCase(reportRepo, cashClosingRepo);

  // HTTP controller
  const controller = new ReportController(
    getLiquidityUseCase,
    getStockInvestmentUseCase,
    getSalesTotalUseCase,
    getFifoCostsUseCase,
    getGrossProfitUseCase,
    getReinvestmentUseCase,
    getOperatingCapitalUseCase,
    getStockByProductUseCase,
    getLotsUseCase,
    manualCashCloseUseCase,
  );

  return createReportRouter(controller);
}
