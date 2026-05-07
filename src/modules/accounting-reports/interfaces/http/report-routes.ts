/**
 * Accounting / Reports Express router.
 *
 * Mounts all report and cash closing endpoints on a single Router.
 * The controller handles request validation and response formatting.
 *
 * @openapi
 * /api/v1/reports/liquidity:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get liquidity report
 *     description: Returns current liquid cash (cash sales - cash expenses)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liquidity report
 *
 * /api/v1/reports/stock-investment:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get stock investment
 *     description: Returns total value of inventory using FIFO costs
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stock investment report
 *
 * /api/v1/reports/sales-total:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get sales total
 *     description: Returns total sales amount in a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: startDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: endDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Sales total report
 *
 * /api/v1/reports/fifo-cogs:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get FIFO COGS
 *     description: Returns cost of goods sold using FIFO
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: FIFO COGS report
 *
 * /api/v1/reports/gross-profit:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get gross profit
 *     description: Returns gross profit (sales - COGS)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Gross profit report
 *
 * /api/v1/reports/reinvestment:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get reinvestment
 *     description: Returns reinvestable amount (gross profit - tax)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reinvestment report
 *
 * /api/v1/reports/operating-capital:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get operating capital
 *     description: Returns operating capital (liquidity + stock investment)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Operating capital report
 *
 * /api/v1/reports/stock-by-product:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get stock by product
 *     description: Returns stock levels grouped by product
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stock by product report
 *
 * /api/v1/reports/lots:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get inventory lots
 *     description: Returns detailed inventory lot data
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lots report
 *
 * /api/v1/cash/closings:
 *   post:
 *     tags:
 *       - Reports
 *     summary: Create cash closing
 *     description: Records a manual cash count for reconciliation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cash closing created
 *       400:
 *         description: Validation error
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
