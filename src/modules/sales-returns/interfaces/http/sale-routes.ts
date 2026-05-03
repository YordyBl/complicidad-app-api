/**
 * Sales / Returns Express router.
 *
 * Mounts sale creation, cancellation, and full-return endpoints.
 */
import { Router } from 'express';
import type { SaleController } from './SaleController.js';

export function createSaleRouter(controller: SaleController): Router {
  const router = Router({ mergeParams: true });

  // ── Sale endpoints ─────────────────────────────────────────
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
