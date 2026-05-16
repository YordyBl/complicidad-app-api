/**
 * Cash Box Express router.
 *
 * Mounts all daily caja (cash box) endpoints under `/api/v1/cash-boxes`.
 *
 * @openapi
 * /api/v1/cash-boxes/current:
 *   get:
 *     tags:
 *       - Cash Boxes
 *     summary: Get current open cash box
 *     description: Returns today's OPEN cash box or a 404 if none is open.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current cash box
 *       404:
 *         description: No open cash box
 *
 * /api/v1/cash-boxes/open:
 *   post:
 *     tags:
 *       - Cash Boxes
 *     summary: Open a new cash box for today
 *     description: Opens the daily caja for today's America/Lima business date.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Cash box opened
 *       400:
 *         description: Already exists or validation error
 *
 * /api/v1/cash-boxes/current/close:
 *   post:
 *     tags:
 *       - Cash Boxes
 *     summary: Close the current cash box
 *     description: Closes today's open caja with a final reconciliation balance.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - finalBalanceCents
 *             properties:
 *               finalBalanceCents:
 *                 type: integer
 *                 description: Final balance in integer cents
 *     responses:
 *       200:
 *         description: Cash box closed
 *       400:
 *         description: No open box or validation error
 *
 * /api/v1/cash-boxes:
 *   get:
 *     tags:
 *       - Cash Boxes
 *     summary: List all cash boxes
 *     description: Returns all cash boxes ordered by business date descending.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of cash boxes
 *
 * /api/v1/cash-boxes/{id}:
 *   get:
 *     tags:
 *       - Cash Boxes
 *     summary: Get cash box summary
 *     description: Returns a financial summary for a specific cash box.
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
 *         description: Cash box summary
 *       404:
 *         description: Cash box not found
 *
 * /api/v1/cash-boxes/current/movements:
 *   post:
 *     tags:
 *       - Cash Boxes
 *     summary: Add a manual cash movement
 *     description: Appends a manual adjustment or withdrawal to today's open caja.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - concept
 *               - amountCents
 *               - type
 *             properties:
 *               concept:
 *                 type: string
 *               amountCents:
 *                 type: integer
 *               type:
 *                 type: string
 *                 enum: [MANUAL_ADJUSTMENT, WITHDRAWAL]
 *     responses:
 *       201:
 *         description: Movement created
 *       400:
 *         description: Validation error
 *
 * /api/v1/cash-boxes/{id}/movements:
 *   get:
 *     tags:
 *       - Cash Boxes
 *     summary: Get cash box movements
 *     description: Returns paginated movements for a cash box with optional filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *       - name: pageSize
 *         in: query
 *         schema:
 *           type: integer
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *       - name: from
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: to
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Paginated movements
 *       404:
 *         description: Cash box not found
 *
 * /api/v1/cash-boxes/current/movements/{movementId}/reverse:
 *   post:
 *     tags:
 *       - Cash Boxes
 *     summary: Reverse a manual movement
 *     description: Creates an opposite entry to reverse an existing movement.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: movementId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Movement reversed
 *       400:
 *         description: Cannot reverse (closed box, legacy entry)
 *       404:
 *         description: Movement not found
 */
import { Router } from 'express';
import type { CashBoxController } from './CashBoxController.js';

export function createCashBoxRouter(controller: CashBoxController): Router {
  const router = Router({ mergeParams: true });

  // ── Current box ────────────────────────────────────────────
  router.get('/cash-boxes/current', (req, res, next) => {
    void controller.getCurrent(req, res).catch(next);
  });

  // ── Open ───────────────────────────────────────────────────
  router.post('/cash-boxes/open', (req, res, next) => {
    void controller.open(req, res).catch(next);
  });

  // ── Close ──────────────────────────────────────────────────
  router.post('/cash-boxes/current/close', (req, res, next) => {
    void controller.close(req, res).catch(next);
  });

  // ── List ───────────────────────────────────────────────────
  router.get('/cash-boxes', (req, res, next) => {
    void controller.list(req, res).catch(next);
  });

  // ── Summary by ID ──────────────────────────────────────────
  router.get('/cash-boxes/:id', (req, res, next) => {
    void controller.getById(req, res).catch(next);
  });

  // ── Manual movement ────────────────────────────────────────
  router.post('/cash-boxes/current/movements', (req, res, next) => {
    void controller.addMovement(req, res).catch(next);
  });

  // ── Movements by ID (paginated + filters) ─────────────────
  router.get('/cash-boxes/:id/movements', (req, res, next) => {
    void controller.getMovements(req, res).catch(next);
  });

  // ── Reverse movement ───────────────────────────────────────
  router.post('/cash-boxes/current/movements/:movementId/reverse', (req, res, next) => {
    void controller.reverseMovement(req, res).catch(next);
  });

  return router;
}
