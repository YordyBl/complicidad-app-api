/**
 * E2E tests for GET /inventory/lots endpoint.
 *
 * Tests the canonical inventory lot read endpoint that the frontend
 * `listInventoryLots()` calls to populate the dedicated lots view.
 *
 * Uses supertest against an Express application with fakes for
 * ListInventoryLotsUseCase and related dependencies.
 * No PostgreSQL required.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express, { json, type Request, type Response } from 'express';
import type { Express } from 'express';

import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import { ok } from '../../../src/shared/domain/Result.js';
import type { Result } from '../../../src/shared/domain/Result.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';
import { err } from '../../../src/shared/domain/Result.js';
import type { ProductController } from '../../../src/modules/inventory/interfaces/http/ProductController.js';
import { InventoryController } from '../../../src/modules/inventory/interfaces/http/InventoryController.js';
import { createInventoryRouter } from '../../../src/modules/inventory/interfaces/http/inventory-routes.js';

// ── Read model types (matching what the use case will return) ─

interface InventoryLotRow {
  lotId: string;
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  attributes: Record<string, string>;
  purchasedQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  purchaseDate: string;
  state: 'INTACT' | 'HISTORICAL' | 'EXHAUSTED';
  allowedAction: 'edit' | 'compensate' | 'none';
  reasonHint?: string | null;
}

interface InventoryLotsResponse {
  product: { id: string; name: string } | null;
  variants: Array<{
    variantId: string;
    sku: string;
    attributes: Record<string, string>;
    stock: number;
    lots: InventoryLotRow[];
  }>;
}

// ── Fake ListInventoryLotsUseCase ──────────────────────────────

class FakeListInventoryLotsUseCase {
  private nextResult: Result<InventoryLotsResponse> = ok({
    product: null,
    variants: [],
  });

  /** Filters received by the use case for assertion */
  receivedFilters: Array<{ productId?: string; variantId?: string }> = [];

  setNextResult(result: Result<InventoryLotsResponse>): void {
    this.nextResult = result;
  }

  async execute(filters: {
    productId?: string;
    variantId?: string;
  }): Promise<Result<InventoryLotsResponse>> {
    this.receivedFilters.push(filters);
    return this.nextResult;
  }
}

// ── Fake RegisterPurchaseUseCase (stub — not used by GET tests) ─

class FakeRegisterPurchaseUseCase {
  async execute(): Promise<Result<unknown>> {
    return ok({});
  }
}

// ── Fake Unit of Work ─────────────────────────────────────────

class FakeUnitOfWork implements UnitOfWork {
  async run<T>(fn: (_scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    return fn({});
  }
}

// ── Helpers ───────────────────────────────────────────────────

function makeLotRow(overrides: Partial<InventoryLotRow> = {}): InventoryLotRow {
  return {
    lotId: 'lot-1',
    variantId: 'var-1',
    productId: 'prod-1',
    productName: 'Zapatillas Urbanas',
    sku: 'ZAP-URB-38',
    attributes: { size: '38' },
    purchasedQuantity: 20,
    remainingQuantity: 20,
    unitCost: 50,
    purchaseDate: '2026-05-01T00:00:00.000Z',
    state: 'INTACT',
    allowedAction: 'edit',
    ...overrides,
  };
}

function makeLotsResponse(
  overrides: Partial<InventoryLotsResponse> = {},
): InventoryLotsResponse {
  return {
    product: { id: 'prod-1', name: 'Zapatillas Urbanas' },
    variants: [
      {
        variantId: 'var-1',
        sku: 'ZAP-URB-38',
        attributes: { size: '38' },
        stock: 20,
        lots: [makeLotRow()],
      },
    ],
    ...overrides,
  };
}

// ── App Factory ────────────────────────────────────────────────

interface TestApp {
  app: Express;
  fakeListUseCase: FakeListInventoryLotsUseCase;
}

function createTestApp(): TestApp {
  const app = express();
  app.use(json());

  const fakeListUseCase = new FakeListInventoryLotsUseCase();
  const fakeRegisterPurchase = new FakeRegisterPurchaseUseCase();
  const fakeUow = new FakeUnitOfWork();

  const inventoryController = new InventoryController(
    fakeRegisterPurchase as never,
    fakeUow as UnitOfWork,
    undefined, // adjustInventoryLotUseCase (unused)
    undefined, // actorContextResolver (unused)
    fakeListUseCase as never,
  );

  const fakeProductController = {
    create: async (_req: Request, _res: Response) => {
      _res.status(404).json({});
    },
    list: async (_req: Request, _res: Response) => {
      _res.status(404).json({});
    },
    getById: async (_req: Request, _res: Response) => {
      _res.status(404).json({});
    },
    search: async (_req: Request, _res: Response) => {
      _res.status(404).json({});
    },
  } as unknown as ProductController;

  const router = createInventoryRouter(fakeProductController, inventoryController);
  app.use('/api/v1', router);

  return { app, fakeListUseCase };
}

// ── Tests ──────────────────────────────────────────────────────

describe('GET /inventory/lots', () => {
  let test: TestApp;

  beforeAll(() => {
    test = createTestApp();
  });

  beforeEach(() => {
    test.fakeListUseCase.receivedFilters = [];
    test.fakeListUseCase.setNextResult(ok(makeLotsResponse()));
  });

  // ── Happy path: returns 200 with JSON ──────────────────────

  it('returns 200 with JSON containing the expected response shape', async () => {
    const res = await request(test.app).get('/api/v1/inventory/lots');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toBeDefined();
  });

  it('returns product and variants structure with lot rows', async () => {
    const res = await request(test.app).get('/api/v1/inventory/lots');

    expect(res.status).toBe(200);
    expect(res.body.product).toEqual({ id: 'prod-1', name: 'Zapatillas Urbanas' });
    expect(res.body.variants).toHaveLength(1);
    expect(res.body.variants[0].variantId).toBe('var-1');
    expect(res.body.variants[0].sku).toBe('ZAP-URB-38');
    expect(res.body.variants[0].lots).toHaveLength(1);

    const lot = res.body.variants[0].lots[0];
    expect(lot.lotId).toBe('lot-1');
    expect(lot.variantId).toBe('var-1');
    expect(lot.productId).toBe('prod-1');
    expect(lot.productName).toBe('Zapatillas Urbanas');
    expect(lot.sku).toBe('ZAP-URB-38');
    expect(lot.attributes).toEqual({ size: '38' });
    expect(lot.purchasedQuantity).toBe(20);
    expect(lot.remainingQuantity).toBe(20);
    expect(lot.unitCost).toBe(50);
    expect(lot.purchaseDate).toBe('2026-05-01T00:00:00.000Z');
    expect(lot.state).toBe('INTACT');
    expect(lot.allowedAction).toBe('edit');
    expect(res.body.variants[0].stock).toBe(20);
  });

  // ── Query param filtering ──────────────────────────────────

  it('passes productId query param to the use case when provided', async () => {
    await request(test.app).get('/api/v1/inventory/lots?productId=prod-001');

    expect(test.fakeListUseCase.receivedFilters).toHaveLength(1);
    expect(test.fakeListUseCase.receivedFilters[0]!.productId).toBe('prod-001');
    expect(test.fakeListUseCase.receivedFilters[0]!.variantId).toBeUndefined();
  });

  it('passes variantId query param to the use case when provided', async () => {
    await request(test.app).get('/api/v1/inventory/lots?variantId=var-002');

    expect(test.fakeListUseCase.receivedFilters).toHaveLength(1);
    expect(test.fakeListUseCase.receivedFilters[0]!.variantId).toBe('var-002');
    expect(test.fakeListUseCase.receivedFilters[0]!.productId).toBeUndefined();
  });

  it('passes both productId and variantId when both are provided', async () => {
    await request(test.app).get(
      '/api/v1/inventory/lots?productId=prod-001&variantId=var-002',
    );

    expect(test.fakeListUseCase.receivedFilters).toHaveLength(1);
    expect(test.fakeListUseCase.receivedFilters[0]!.productId).toBe('prod-001');
    expect(test.fakeListUseCase.receivedFilters[0]!.variantId).toBe('var-002');
  });

  it('passes no filters when no query params are provided', async () => {
    await request(test.app).get('/api/v1/inventory/lots');

    expect(test.fakeListUseCase.receivedFilters).toHaveLength(1);
    expect(test.fakeListUseCase.receivedFilters[0]!.productId).toBeUndefined();
    expect(test.fakeListUseCase.receivedFilters[0]!.variantId).toBeUndefined();
  });

  // ── INTACT vs HISTORICAL vs EXHAUSTED propagation ──────────

  it('returns HISTORICAL state and compensate action for historical lots', async () => {
    test.fakeListUseCase.setNextResult(
      ok(
        makeLotsResponse({
          variants: [
            {
              variantId: 'var-1',
              sku: 'ZAP-URB-38',
              attributes: { size: '38' },
              stock: 10,
              lots: [
                makeLotRow({
                  lotId: 'lot-hist',
                  remainingQuantity: 10,
                  purchasedQuantity: 20,
                  state: 'HISTORICAL',
                  allowedAction: 'compensate',
                  reasonHint: 'Tiene ajustes previos',
                }),
              ],
            },
          ],
        }),
      ),
    );

    const res = await request(test.app).get('/api/v1/inventory/lots');

    expect(res.status).toBe(200);
    const lot = res.body.variants[0].lots[0];
    expect(lot.state).toBe('HISTORICAL');
    expect(lot.allowedAction).toBe('compensate');
    expect(lot.reasonHint).toBe('Tiene ajustes previos');
  });

  it('returns EXHAUSTED state and none action for exhausted lots', async () => {
    test.fakeListUseCase.setNextResult(
      ok(
        makeLotsResponse({
          variants: [
            {
              variantId: 'var-1',
              sku: 'ZAP-URB-38',
              attributes: { size: '38' },
              stock: 0,
              lots: [
                makeLotRow({
                  lotId: 'lot-exhausted',
                  remainingQuantity: 0,
                  purchasedQuantity: 20,
                  state: 'EXHAUSTED',
                  allowedAction: 'none',
                }),
              ],
            },
          ],
        }),
      ),
    );

    const res = await request(test.app).get('/api/v1/inventory/lots');

    expect(res.status).toBe(200);
    const lot = res.body.variants[0].lots[0];
    expect(lot.state).toBe('EXHAUSTED');
    expect(lot.allowedAction).toBe('none');
  });

  // ── Empty response ─────────────────────────────────────────

  it('returns 200 with empty variants array when no lots exist', async () => {
    test.fakeListUseCase.setNextResult(
      ok({ product: null, variants: [] }),
    );

    const res = await request(test.app).get('/api/v1/inventory/lots');

    expect(res.status).toBe(200);
    expect(res.body.variants).toEqual([]);
    expect(res.body.product).toBeNull();
  });

  // ── Error propagation ──────────────────────────────────────

  it('returns 404 when use case returns NotFoundError', async () => {
    test.fakeListUseCase.setNextResult(
      err(new NotFoundError('Product', 'prod-unknown')),
    );

    const res = await request(test.app).get(
      '/api/v1/inventory/lots?productId=prod-unknown',
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.message).toBeDefined();
  });

  it('returns 400 when use case returns a generic error', async () => {
    test.fakeListUseCase.setNextResult(
      err({
        name: 'BusinessRuleError',
        message: 'Error de negocio simulado',
      }),
    );

    const res = await request(test.app).get('/api/v1/inventory/lots');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.message).toContain('Error de negocio simulado');
  });

  // ── Route does NOT return 404 ──────────────────────────────

  it('does NOT return 404 (proves route is registered)', async () => {
    const res = await request(test.app).get('/api/v1/inventory/lots');

    expect(res.status).not.toBe(404);
  });
});
