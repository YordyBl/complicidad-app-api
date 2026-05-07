/**
 * Sales / Returns Express router.
 *
 * Mounts sale creation, cancellation, full-return, listing, and detail endpoints.
 *
 * @openapi
 * /api/v1/sales:
 *   post:
 *     tags:
 *       - Sales
 *     summary: Create a sale
 *     description: Creates a multi-item sale with automatic FIFO cost calculation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - channel
 *               - items
 *             properties:
 *               customerId:
 *                 type: string
 *               channel:
 *                 type: string
 *                 enum: [store, whatsapp, mercado_libre, web]
 *               channelReference:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     variantId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     priceType:
 *                       type: string
 *                       enum: [regular, presale]
 *     responses:
 *       201:
 *         description: Sale created
 *       400:
 *         description: Validation error
 *
 *   get:
 *     tags:
 *       - Sales
 *     summary: List sales
 *     description: Returns a paginated list of sales with filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *       - name: pageSize
 *         in: query
 *         schema:
 *           type: integer
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [ACTIVE, CANCELLED, RETURNED]
 *       - name: customerId
 *         in: query
 *         schema:
 *           type: string
 *       - name: channel
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sales list
 *
 * /api/v1/sales/{id}:
 *   get:
 *     tags:
 *       - Sales
 *     summary: Get sale by ID
 *     description: Returns sale details with items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sale details
 *       404:
 *         description: Sale not found
 *
 * /api/v1/sales/{id}/cancel:
 *   post:
 *     tags:
 *       - Sales
 *     summary: Cancel a sale
 *     description: Cancels an active sale and restocks inventory
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sale cancelled
 *       400:
 *         description: Cannot cancel
 *       404:
 *         description: Sale not found
 *
 * /api/v1/sales/{id}/return:
 *   post:
 *     tags:
 *       - Sales
 *     summary: Full return a sale
 *     description: Returns all items from a sale and refunds total
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sale returned
 *       400:
 *         description: Cannot return
 *       404:
 *         description: Sale not found
 */
import { Router } from 'express';
import type { SaleController } from './SaleController.js';

export function createSaleRouter(controller: SaleController): Router {
  const router = Router({ mergeParams: true });

  // ── Sale list ──────────────────────────────────────────────
  router.get('/sales', (req, res, next) => {
    void controller.list(req, res).catch(next);
  });

  // ── Sale detail ────────────────────────────────────────────
  router.get('/sales/:id', (req, res, next) => {
    void controller.getById(req, res).catch(next);
  });

  // ── Sale creation ──────────────────────────────────────────
  router.post('/sales', (req, res, next) => {
    void controller.create(req, res).catch(next);
  });

  // ── Cancellation ───────────────────────────────────────────
  router.post('/sales/:id/cancel', (req, res, next) => {
    void controller.cancel(req, res).catch(next);
  });

  // ── Full return ────────────────────────────────────────────
  router.post('/sales/:id/return', (req, res, next) => {
    void controller.returnSale(req, res).catch(next);
  });

  return router;
}
