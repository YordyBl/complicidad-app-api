/**
 * Inventory / Product / Purchase Express router.
 *
 * Mounts product creation and purchase registration endpoints.
 *
 * @openapi
 * /api/v1/products:
 *   post:
 *     tags:
 *       - Products
 *     summary: Create a new product
 *     description: Creates a new product with auto-generated variants from sizes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - baseSku
 *               - salePrice
 *               - sizes
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               baseSku:
 *                 type: string
 *               salePrice:
 *                 type: number
 *               presalePrice:
 *                 type: number
 *               sizes:
 *                 type: array
 *                 items:
 *                   type: string
 *               aliases:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Product created
 *       400:
 *         description: Validation error
 *
 *   get:
 *     tags:
 *       - Products
 *     summary: List products
 *     description: Returns a paginated list of products
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
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [active, inactive, all]
 *       - name: sortBy
 *         in: query
 *         schema:
 *           type: string
 *           enum: [name, createdAt, updatedAt]
 *       - name: sortOrder
 *         in: query
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Product list
 *
 * /api/v1/products/{id}:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get product by ID
 *     description: Returns a single product with its variants
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
 *         description: Product details
 *       404:
 *         description: Product not found
 *
 * /api/v1/items/search:
 *   get:
 *     tags:
 *       - Products
 *     summary: Search items
 *     description: Search for items by SKU or product alias
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: term
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results
 *       404:
 *         description: No items found
 *
 * /api/v1/purchases:
 *   post:
 *     tags:
 *       - Inventory
 *     summary: Register a purchase
 *     description: Register a batch stock purchase (stock intake)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     variantId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unitCost:
 *                       type: number
 *               supplierId:
 *                 type: string
 *               notes:
 *                 type: string
 *               purchaseDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Purchase registered
 *       400:
 *         description: Validation error
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

  router.get('/products', (req, res, next) => {
    void productController.list(req, res).catch(next);
  });

  router.get('/products/:id', (req, res, next) => {
    void productController.getById(req, res).catch(next);
  });

  // ── Item search ────────────────────────────────────────────
  router.get('/items/search', (req, res, next) => {
    void productController.search(req, res).catch(next);
  });

  // ── Purchase endpoints ─────────────────────────────────────
  router.post('/purchases', (req, res, next) => {
    void inventoryController.registerPurchase(req, res).catch(next);
  });

  // ── Lot adjustment endpoints ───────────────────────────────
  // Increase: create new lot with stock
  router.post('/inventory/lots/adjustments/increase', (req, res, next) => {
    void inventoryController.adjustIncrease(req, res).catch(next);
  });

  // Intact direct edit
  router.patch('/inventory/lots/:lotId', (req, res, next) => {
    void inventoryController.patchLot(req, res).catch(next);
  });

  // Historical compensation
  router.post('/inventory/lots/:lotId/adjustments', (req, res, next) => {
    void inventoryController.adjustHistorical(req, res).catch(next);
  });

  return router;
}
