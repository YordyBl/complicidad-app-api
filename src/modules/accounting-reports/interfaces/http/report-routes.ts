/**
 * Accounting / Reports Express router.
 *
 * Mounts all report and cash closing endpoints on a single Router.
 * The controller handles request validation and response formatting.
 */
import { Router } from 'express';
import type { ReportController } from './ReportController.js';

export function createReportRouter(controller: ReportController): Router {
  const router = Router({ mergeParams: true });

  // ── Report endpoints ───────────────────────────────────────

  router.get('/reports/liquidity', (req, res, next) => {
    void controller.liquidity(req, res).catch(next);
  });

  router.get('/reports/stock-investment', (req, res, next) => {
    void controller.stockInvestment(req, res).catch(next);
  });

  router.get('/reports/sales-total', (req, res, next) => {
    void controller.salesTotal(req, res).catch(next);
  });

  router.get('/reports/fifo-cogs', (req, res, next) => {
    void controller.fifoCosts(req, res).catch(next);
  });

  router.get('/reports/gross-profit', (req, res, next) => {
    void controller.grossProfit(req, res).catch(next);
  });

  router.get('/reports/reinvestment', (req, res, next) => {
    void controller.reinvestment(req, res).catch(next);
  });

  router.get('/reports/operating-capital', (req, res, next) => {
    void controller.operatingCapital(req, res).catch(next);
  });

  router.get('/reports/stock-by-product', (req, res, next) => {
    void controller.stockByProduct(req, res).catch(next);
  });

  router.get('/reports/lots', (req, res, next) => {
    void controller.lots(req, res).catch(next);
  });

  // ── Cash closing endpoints ─────────────────────────────────

  router.post('/cash/closings', (req, res, next) => {
    void controller.cashClose(req, res).catch(next);
  });

  return router;
}
