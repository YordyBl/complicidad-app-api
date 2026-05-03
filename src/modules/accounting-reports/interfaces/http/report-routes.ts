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

  router.get('/reports/liquidity', (req, res) => {
    void controller.liquidity(req, res);
  });

  router.get('/reports/stock-investment', (req, res) => {
    void controller.stockInvestment(req, res);
  });

  router.get('/reports/sales-total', (req, res) => {
    void controller.salesTotal(req, res);
  });

  router.get('/reports/fifo-cogs', (req, res) => {
    void controller.fifoCosts(req, res);
  });

  router.get('/reports/gross-profit', (req, res) => {
    void controller.grossProfit(req, res);
  });

  router.get('/reports/reinvestment', (req, res) => {
    void controller.reinvestment(req, res);
  });

  router.get('/reports/operating-capital', (req, res) => {
    void controller.operatingCapital(req, res);
  });

  router.get('/reports/stock-by-product', (req, res) => {
    void controller.stockByProduct(req, res);
  });

  router.get('/reports/lots', (req, res) => {
    void controller.lots(req, res);
  });

  // ── Cash closing endpoints ─────────────────────────────────

  router.post('/cash/closings', (req, res) => {
    void controller.cashClose(req, res);
  });

  return router;
}
