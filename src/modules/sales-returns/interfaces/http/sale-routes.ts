/**
 * Sales / Returns Express router.
 *
 * Mounts sale creation, cancellation, full-return, listing, and detail endpoints.
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
