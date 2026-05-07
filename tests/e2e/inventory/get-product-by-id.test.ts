/**
 * E2E tests for GET /api/v1/products/:id endpoint.
 *
 * Uses supertest against an Express application with real router/controller
 * wired with fake use cases. No PostgreSQL required.
 *
 * Verifies:
 * - 200 with product detail for existing ID
 * - 404 for non-existent product
 * - 503 when use case is not available
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { json, type Request, type Response } from 'express';
import type { Express } from 'express';

import { ProductController } from '../../../src/modules/inventory/interfaces/http/ProductController.js';
import { createInventoryRouter } from '../../../src/modules/inventory/interfaces/http/inventory-routes.js';
import type { InventoryController } from '../../../src/modules/inventory/interfaces/http/InventoryController.js';
import type { ProductListItem } from '../../../src/modules/inventory/domain/ProductListReadRepository.js';

// ── Fake use case ───────────────────────────────────────────

class FakeGetProductByIdUseCase {
  private nextResult: ProductListItem | null = null;

  setNextResult(result: ProductListItem | null): void {
    this.nextResult = result;
  }

  async execute(_id: string): Promise<ProductListItem | null> {
    return this.nextResult;
  }
}

// ── App factory ──────────────────────────────────────────────

function createTestApp(): {
  app: Express;
  getProductById: FakeGetProductByIdUseCase;
} {
  const app = express();
  app.use(json());

  const getProductById = new FakeGetProductByIdUseCase();

  // Provide fakes for all dependencies; only getProductById matters here.
  const productController = new ProductController(
    undefined as never,
    undefined,
    undefined,
    getProductById as never,
  );

  const fakeInventoryController = {
    registerPurchase: async (_req: Request, _res: Response) => {
      _res.status(404).json({});
    },
  } as unknown as InventoryController;

  const router = createInventoryRouter(productController, fakeInventoryController);
  app.use('/api/v1', router);

  return { app, getProductById };
}

// ── Test data ────────────────────────────────────────────────

function makeProductDetail(overrides: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id: 'prod-1',
    name: 'Remera Classic',
    description: 'Remera de algodón premium',
    baseSku: 'remera-classic',
    salePrice: 250,
    presalePrice: 450,
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    variants: [
      {
        id: 'var-1',
        sku: 'REM-CLA-M',
        attributes: { size: 'M', color: 'Negro' },
        isActive: true,
        stock: 15,
      },
    ],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('GET /api/v1/products/:id (E2E)', () => {
  let app: Express;
  let getProductById: FakeGetProductByIdUseCase;

  beforeAll(() => {
    const test = createTestApp();
    app = test.app;
    getProductById = test.getProductById;
  });

  // ── Happy path ──────────────────────────────────────────

  it('returns 200 with product detail for existing ID', async () => {
    const product = makeProductDetail();
    getProductById.setNextResult(product);

    const res = await request(app).get('/api/v1/products/prod-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'prod-1',
      name: 'Remera Classic',
      salePrice: 250,
    });
    expect(res.body.variants).toHaveLength(1);
    expect(res.body.variants[0].sku).toBe('REM-CLA-M');
  });

  // ── Not found ───────────────────────────────────────────

  it('returns 404 when product does not exist', async () => {
    getProductById.setNextResult(null);

    const res = await request(app).get('/api/v1/products/non-existent');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
    expect(res.body.error).toBe('NotFound');
    expect(res.body.message).toContain('no encontrado');
  });

  // ── 503 — use case not wired ────────────────────────────

  it('returns 503 when use case is not available', async () => {
    // Create a controller WITHOUT the getProductById use case
    const controller = new ProductController(
      undefined as never,
      undefined,
      undefined,
      undefined, // explicitly undefined → will produce 503
    );
    const router = createInventoryRouter(
      controller,
      { registerPurchase: async (_req: Request, _res: Response) => { _res.status(404).json({}); } } as unknown as InventoryController,
    );
    const testApp = express();
    testApp.use('/api/v1', router);

    const res = await request(testApp).get('/api/v1/products/prod-1');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ServiceUnavailable');
    expect(res.body.message).toContain('detalle');
  });
});
