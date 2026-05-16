/**
 * Accounting / Reports module composition root.
 *
 * Wires the domain, application, infrastructure, and HTTP layers together.
 * Called from the server bootstrap once the DataSource is available.
 *
 * Returns an Express Router that includes both legacy report endpoints
 * and the new cash-box endpoints.
 */
import { Router } from 'express';
import type { EntityManager } from 'typeorm';
import { CashClosingTypeOrmRepository } from './infrastructure/typeorm/CashClosingTypeOrmRepository.js';
import { ReportQueryAdapter } from './infrastructure/typeorm/ReportQueryAdapter.js';
import { CashBoxTypeOrmRepository } from './infrastructure/typeorm/CashBoxTypeOrmRepository.js';
import { CashLedgerTypeOrmRepository } from './infrastructure/typeorm/CashLedgerTypeOrmRepository.js';
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
import { OpenCashBoxUseCase } from './application/use-cases/OpenCashBoxUseCase.js';
import { CloseCashBoxUseCase } from './application/use-cases/CloseCashBoxUseCase.js';
import { GetCurrentCashBoxUseCase } from './application/use-cases/GetCurrentCashBoxUseCase.js';
import { GetCashBoxSummaryUseCase } from './application/use-cases/GetCashBoxSummaryUseCase.js';
import { AddManualMovementUseCase } from './application/use-cases/AddManualMovementUseCase.js';
import { ReverseMovementUseCase } from './application/use-cases/ReverseMovementUseCase.js';
import { GetCashBoxMovementsUseCase } from './application/use-cases/GetCashBoxMovementsUseCase.js';
import { ReportController } from './interfaces/http/ReportController.js';
import { createReportRouter } from './interfaces/http/report-routes.js';
import { CashBoxController } from './interfaces/http/CashBoxController.js';
import { createCashBoxRouter } from './interfaces/http/cash-box-routes.js';

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
        message: 'Base de datos no conectada — endpoints de reportes no disponibles',
      });
    });
    return router;
  }

  // Infrastructure — reports
  const reportRepo = new ReportQueryAdapter(manager);
  const cashClosingRepo = new CashClosingTypeOrmRepository(manager);

  // Infrastructure — cash boxes
  const cashBoxRepo = new CashBoxTypeOrmRepository(manager);
  const cashLedgerRepo = new CashLedgerTypeOrmRepository(manager);

  // ── Report use cases ──────────────────────────────────────
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

  // ── Cash box use cases ────────────────────────────────────
  const openCashBoxUseCase = new OpenCashBoxUseCase(cashBoxRepo);
  const closeCashBoxUseCase = new CloseCashBoxUseCase(cashBoxRepo);
  const getCurrentCashBoxUseCase = new GetCurrentCashBoxUseCase(cashBoxRepo);
  const getCashBoxSummaryUseCase = new GetCashBoxSummaryUseCase(cashBoxRepo, cashLedgerRepo);
  const addManualMovementUseCase = new AddManualMovementUseCase(cashBoxRepo, cashLedgerRepo);
  const reverseMovementUseCase = new ReverseMovementUseCase(cashBoxRepo, cashLedgerRepo);
  const getCashBoxMovementsUseCase = new GetCashBoxMovementsUseCase(cashBoxRepo, cashLedgerRepo);

  // HTTP controllers
  const reportController = new ReportController(
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

  const cashBoxController = new CashBoxController(
    openCashBoxUseCase,
    closeCashBoxUseCase,
    getCurrentCashBoxUseCase,
    getCashBoxSummaryUseCase,
    addManualMovementUseCase,
    getCashBoxMovementsUseCase,
    reverseMovementUseCase,
    cashBoxRepo,
  );

  // Mount both routers
  const router = Router({ mergeParams: true });
  router.use(createReportRouter(reportController));
  router.use(createCashBoxRouter(cashBoxController));
  return router;
}
