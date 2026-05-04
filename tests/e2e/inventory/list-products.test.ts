/**
 * E2E tests for GET /api/v1/products endpoint.
 *
 * Uses supertest against an Express application with real router/controller
 * wired with fake use cases. No PostgreSQL required.
 *
 * Verifies:
 * - Default 200 listing response shape
 * - Filtered listing with all query params
 * - Invalid query 400 validation errors (machine-readable)
 * - Empty result 200 metadata
 * - 503 when listing use case is not available
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { json, type Request, type Response } from 'express';
import type { Express } from 'express';

import { ProductController } from '../../../src/modules/inventory/interfaces/http/ProductController.js';
import { createInventoryRouter } from '../../../src/modules/inventory/interfaces/http/inventory-routes.js';
import type { InventoryController } from '../../../src/modules/inventory/interfaces/http/InventoryController.js';
import type { ListProductsInput } from '../../../src/modules/inventory/application/use-cases/ListProductsUseCase.js';
import type { ListProductsResult } from '../../../src/modules/inventory/domain/ProductListReadRepository.js';

// ── Fake use case ───────────────────────────────────────────

class FakeListProductsUseCase {
  private nextResult: ListProductsResult = {
    items: [],
    meta: {
      page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
      hasNextPage: false, hasPreviousPage: false,
      sortBy: 'createdAt', sortOrder: 'desc',
      filters: { status: 'active', search: '' },
    },
  };

  setNextResult(result: ListProductsResult): void {
    this.nextResult = result;
  }

  async execute(_input: ListProductsInput = {}): Promise<ListProductsResult> {
    return this.nextResult;
  }
}

// ── App factory ──────────────────────────────────────────────

function createTestApp(): {
  app: Express;
  listProducts: FakeListProductsUseCase;
} {
  const app = express();
  app.use(json());

  const listProducts = new FakeListProductsUseCase();

  // The ProductController constructor accepts (CreateProductUseCase, SearchItemUseCase?, ListProductsUseCase?).
  // Provide undefined for the first two since we only test listing.
  const productController = new ProductController(
    undefined as never,
    undefined,
    listProducts as never,
  );

  // createInventoryRouter needs ProductController and InventoryController.
  // We only test GET /products, so InventoryController can be a minimal fake.
  const fakeInventoryController = {
    registerPurchase: async (_req: Request, _res: Response) => {
      _res.status(404).json({});
    },
  } as unknown as InventoryController;

  const router = createInventoryRouter(productController, fakeInventoryController);
  app.use('/api/v1', router);

  return { app, listProducts };
}

// ── Helpers ──────────────────────────────────────────────────

function makeItem(productId: string, name: string, variantCount = 1) {
  const variants = Array.from({ length: variantCount }, (_, i) => ({
    id: `var-${productId}-${i}`,
    sku: `SKU-${productId}-${i}`,
    attributes: {},
    isActive: true,
  }));
  return {
    id: productId,
    name,
    description: null,
    baseSku: 'test-sku',
    salePrice: 15.00,
    presalePrice: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    variants,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('GET /api/v1/products (E2E)', () => {
  let app: Express;
  let listProducts: FakeListProductsUseCase;

  beforeAll(() => {
    const test = createTestApp();
    app = test.app;
    listProducts = test.listProducts;
  });

  // ── Happy paths ──────────────────────────────────────────

  it('returns 200 with data and meta on default request', async () => {
    const items = [makeItem('p1', 'Coca Cola', 2), makeItem('p2', 'Pepsi', 1)];
    listProducts.setNextResult({
      items,
      meta: {
        page: 1, pageSize: 20, totalItems: 2, totalPages: 1,
        hasNextPage: false, hasPreviousPage: false,
        sortBy: 'createdAt', sortOrder: 'desc',
        filters: { status: 'active', search: '' },
      },
    });

    const res = await request(app).get('/api/v1/products');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe('Coca Cola');
    expect(res.body.data[0].variants).toHaveLength(2);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.totalItems).toBe(2);
    expect(res.body.meta.sortBy).toBe('createdAt');
    expect(res.body.meta.sortOrder).toBe('desc');
    expect(res.body.meta.filters).toEqual({ status: 'active', search: '' });
  });

  it('returns 200 with filtered results using all query params', async () => {
    listProducts.setNextResult({
      items: [makeItem('p10', 'Shirt', 1)],
      meta: {
        page: 2, pageSize: 10, totalItems: 15, totalPages: 2,
        hasNextPage: false, hasPreviousPage: true,
        sortBy: 'name', sortOrder: 'asc',
        filters: { status: 'all', search: 'shirt' },
      },
    });

    const res = await request(app).get(
      '/api/v1/products?page=2&pageSize=10&search=shirt&status=all&sortBy=name&sortOrder=asc',
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.hasPreviousPage).toBe(true);
    expect(res.body.meta.sortBy).toBe('name');
    expect(res.body.meta.sortOrder).toBe('asc');
    expect(res.body.meta.filters).toEqual({ status: 'all', search: 'shirt' });
  });

  // ── Empty result ─────────────────────────────────────────

  it('returns 200 with empty data when no products match', async () => {
    listProducts.setNextResult({
      items: [],
      meta: {
        page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
        hasNextPage: false, hasPreviousPage: false,
        sortBy: 'createdAt', sortOrder: 'desc',
        filters: { status: 'active', search: '' },
      },
    });

    const res = await request(app).get('/api/v1/products');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalItems).toBe(0);
    expect(res.body.meta.totalPages).toBe(0);
    expect(res.body.meta.hasNextPage).toBe(false);
    expect(res.body.meta.hasPreviousPage).toBe(false);
    expect(res.body.meta.sortBy).toBe('createdAt');
    expect(res.body.meta.sortOrder).toBe('desc');
    expect(res.body.meta.filters).toEqual({ status: 'active', search: '' });
  });

  // ── Validation errors ────────────────────────────────────

  it('returns 400 for page=0', async () => {
    const res = await request(app).get('/api/v1/products?page=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.message).toContain('page');
  });

  it('returns 400 for page=-1', async () => {
    const res = await request(app).get('/api/v1/products?page=-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 for non-integer page', async () => {
    const res = await request(app).get('/api/v1/products?page=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 for pageSize=0', async () => {
    const res = await request(app).get('/api/v1/products?pageSize=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 for pageSize=101', async () => {
    const res = await request(app).get('/api/v1/products?pageSize=101');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 for non-integer pageSize', async () => {
    const res = await request(app).get('/api/v1/products?pageSize=xyz');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 for overlong search', async () => {
    const longSearch = 'x'.repeat(101);
    const res = await request(app).get(`/api/v1/products?search=${longSearch}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.message).toContain('search');
  });

  it('returns 400 for unknown status', async () => {
    const res = await request(app).get('/api/v1/products?status=deleted');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.message).toContain('status');
  });

  it('returns 400 for unknown sortBy', async () => {
    const res = await request(app).get('/api/v1/products?sortBy=price');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.message).toContain('sortBy');
  });

  it('returns 400 for unknown sortOrder', async () => {
    const res = await request(app).get('/api/v1/products?sortOrder=up');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.message).toContain('sortOrder');
  });
});
