/**
 * Inventory / Product / Purchase Express router.
 *
 * Mounts product creation and purchase registration endpoints.
 */
import { Router } from 'express';
import type { ProductController } from './ProductController.js';
import type { InventoryController } from './InventoryController.js';

export function createInventoryRouter(
  productController: ProductController,
  inventoryController: InventoryController,
): Router {
  const router = Router({ mergeParams: true });

  // ── Product endpoints ──────────────────────────────────────
  router.post('/products', (req, res, next) => {
    void productController.create(req, res).catch(next);
  });

  // ── Item search ────────────────────────────────────────────
  router.get('/items/search', (req, res, next) => {
    void productController.search(req, res).catch(next);
  });

  // ── Purchase endpoints ─────────────────────────────────────
  router.post('/purchases', (req, res, next) => {
    void inventoryController.registerPurchase(req, res).catch(next);
  });

  return router;
}
