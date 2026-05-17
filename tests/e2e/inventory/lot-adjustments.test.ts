/**
 * E2E tests for inventory lot adjustment HTTP endpoints.
 *
 * Tests the three adjustment routes defined in the design:
 * - POST /api/v1/inventory/lots/adjustments/increase
 * - PATCH /api/v1/inventory/lots/:lotId
 * - POST /api/v1/inventory/lots/:lotId/adjustments
 *
 * Uses supertest against an Express application with fakes for
 * AdjustInventoryLotUseCase, ActorContextResolver, and UnitOfWork.
 * No PostgreSQL required.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express, { json, type Request, type Response } from 'express';
import type { Express } from 'express';

import { AdjustInventoryLotUseCase } from '../../../src/modules/inventory/application/use-cases/AdjustInventoryLotUseCase.js';
import type { AdjustInventoryLotCommand, AdjustInventoryLotResponse } from '../../../src/modules/inventory/application/use-cases/AdjustInventoryLotUseCase.js';
import { ActorContextResolver } from '../../../src/modules/inventory/interfaces/http/ActorContextResolver.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import { err, ok } from '../../../src/shared/domain/Result.js';
import type { Result } from '../../../src/shared/domain/Result.js';
import { BusinessRuleError, NotFoundError } from '../../../src/shared/domain/errors.js';
import type { ProductController } from '../../../src/modules/inventory/interfaces/http/ProductController.js';
import { InventoryController } from '../../../src/modules/inventory/interfaces/http/InventoryController.js';
import { createInventoryRouter } from '../../../src/modules/inventory/interfaces/http/inventory-routes.js';

// ── Fake AdjustInventoryLotUseCase ─────────────────────────────

type FakeAdjustResult = Result<AdjustInventoryLotResponse>;

class FakeAdjustInventoryLotUseCase {
  private nextResult: FakeAdjustResult = ok(makeAdjustmentResponse());
  /** Commands received by the use case for assertion */
  receivedCommands: AdjustInventoryLotCommand[] = [];

  setNextResult(result: FakeAdjustResult): void {
    this.nextResult = result;
  }

  async execute(
    command: AdjustInventoryLotCommand,
    _uow: UnitOfWork,
  ): Promise<FakeAdjustResult> {
    this.receivedCommands.push(command);
    return this.nextResult;
  }
}

// ── Fake Unit of Work ──────────────────────────────────────────

class FakeUnitOfWork implements UnitOfWork {
  committed = false;
  rolledBack = false;

  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    try {
      const result = await fn({});
      this.committed = true;
      return result;
    } catch {
      this.rolledBack = true;
      throw new Error('rollback');
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────

function makeAdjustmentResponse(overrides: Partial<AdjustInventoryLotResponse> = {}): AdjustInventoryLotResponse {
  return {
    adjustmentId: 'adj-001',
    action: 'INCREASE',
    variantId: 'var-1',
    targetLotId: 'lot-1',
    createdLotId: 'lot-1',
    beforeQuantity: 0,
    afterQuantity: 10,
    beforeUnitCostCents: 0,
    afterUnitCostCents: 5000,
    deltaQuantity: 10,
    reason: 'Ajuste por corrección',
    actorId: 'admin-1',
    actorSource: 'header',
    ...overrides,
  };
}

// ── App Factory ─────────────────────────────────────────────────

interface TestApp {
  app: Express;
  fakeUseCase: FakeAdjustInventoryLotUseCase;
  fakeUow: FakeUnitOfWork;
}

function createTestApp(): TestApp {
  const app = express();
  app.use(json());

  const fakeUseCase = new FakeAdjustInventoryLotUseCase();
  const actorResolver = new ActorContextResolver();
  const fakeUow = new FakeUnitOfWork();

  // InventoryController now accepts optional adjustment use case + actor resolver
  const inventoryController = new InventoryController(
    undefined as never, // registerPurchaseUseCase (unused)
    fakeUow,
    fakeUseCase as unknown as AdjustInventoryLotUseCase,
    actorResolver,
  );

  const fakeProductController = {
    create: async (_req: Request, _res: Response) => { _res.status(404).json({}); },
    list: async (_req: Request, _res: Response) => { _res.status(404).json({}); },
    getById: async (_req: Request, _res: Response) => { _res.status(404).json({}); },
    search: async (_req: Request, _res: Response) => { _res.status(404).json({}); },
  } as unknown as ProductController;

  const router = createInventoryRouter(fakeProductController, inventoryController);
  app.use('/api/v1', router);

  return { app, fakeUseCase, fakeUow };
}

// ── Actor header helpers ───────────────────────────────────────

const ACTOR_HEADERS = {
  'x-actor-id': 'admin-1',
  'x-actor-source': 'header',
};

// ── Tests ──────────────────────────────────────────────────────

describe('Inventory Lot Adjustment E2E', () => {
  let test: TestApp;

  beforeAll(() => {
    test = createTestApp();
  });

  beforeEach(() => {
    test.fakeUseCase.receivedCommands = [];
    test.fakeUseCase.setNextResult(ok(makeAdjustmentResponse()));
  });

  // ══════════════════════════════════════════════════════════════
  // POST /inventory/lots/adjustments/increase
  // ══════════════════════════════════════════════════════════════

  describe('POST /inventory/lots/adjustments/increase', () => {
    it('returns 201 with adjustment response on valid increase', async () => {
      test.fakeUseCase.setNextResult(ok(makeAdjustmentResponse({
        adjustmentId: 'adj-inc-1',
        action: 'INCREASE',
        targetLotId: 'lot-new',
        createdLotId: 'lot-new',
        afterQuantity: 15,
        deltaQuantity: 15,
        beforeUnitCostCents: 0,
        afterUnitCostCents: 3000,
      })));

      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 15,
          unitCost: 30,
          reason: 'Aumento manual',
          effectiveAt: '2026-05-15T00:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.adjustmentId).toBe('adj-inc-1');
      expect(res.body.action).toBe('INCREASE');
      expect(res.body.variantId).toBe('var-1');
      expect(res.body.createdLotId).toBe('lot-new');
      expect(res.body.deltaQuantity).toBe(15);

      // Assert command was received by use case
      expect(test.fakeUseCase.receivedCommands).toHaveLength(1);
      const cmd = test.fakeUseCase.receivedCommands[0]!;
      expect(cmd.action).toBe('INCREASE');
      expect(cmd.variantId).toBe('var-1');
      expect(cmd.quantity).toBe(15);
      expect(cmd.unitCost).toBe(30);
      expect(cmd.reason).toBe('Aumento manual');
      expect(cmd.actorId).toBe('admin-1');
      expect(cmd.actorSource).toBe('header');
    });

    it('returns 400 when actor headers are missing', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .send({
          variantId: 'var-1',
          quantity: 10,
          reason: 'Sin actor',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('MissingActor');
      expect(res.body.message).toBeDefined();
    });

    it('returns 400 when variantId is missing', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .set(ACTOR_HEADERS)
        .send({
          quantity: 10,
          reason: 'Falta variantId',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ValidationError');
    });

    it('returns 400 when quantity is not a positive integer', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 0,
          reason: 'Cantidad cero',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ValidationError');
    });

    it('returns 404 when use case returns NotFoundError', async () => {
      test.fakeUseCase.setNextResult(
        err(new NotFoundError('Variant', 'var-unknown')),
      );

      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-unknown',
          quantity: 10,
          reason: 'Variante desconocida',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when reason is missing', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ValidationError');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // PATCH /inventory/lots/:lotId (intact edit)
  // ══════════════════════════════════════════════════════════════

  describe('PATCH /inventory/lots/:lotId', () => {
    it('returns 200 with adjustment response on valid intact edit', async () => {
      test.fakeUseCase.setNextResult(ok(makeAdjustmentResponse({
        adjustmentId: 'adj-edit-1',
        action: 'INTACT_EDIT',
        targetLotId: 'lot-5',
        createdLotId: null,
        beforeQuantity: 10,
        afterQuantity: 20,
        beforeUnitCostCents: 5000,
        afterUnitCostCents: 5000,
        deltaQuantity: 10,
      })));

      const res = await request(test.app)
        .patch('/api/v1/inventory/lots/lot-5')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 20,
          reason: 'Corrección de cantidad',
          effectiveAt: '2026-05-15T00:00:00.000Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('INTACT_EDIT');
      expect(res.body.targetLotId).toBe('lot-5');
      expect(res.body.afterQuantity).toBe(20);

      const cmd = test.fakeUseCase.receivedCommands[0]!;
      expect(cmd.action).toBe('INTACT_EDIT');
      expect(cmd.lotId).toBe('lot-5');
      expect(cmd.quantity).toBe(20);
    });

    it('returns 400 when lotId path param is missing or empty', async () => {
      // Express won't match the route without the param, so test with empty
      // PATCH with invalid body but valid route
      const res = await request(test.app)
        .patch('/api/v1/inventory/lots/ ')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 20,
          reason: 'Test',
        });

      // Either 400 (validation) or 404 (no match)
      expect([400, 404]).toContain(res.status);
    });

    it('returns 400 when actor headers are missing', async () => {
      const res = await request(test.app)
        .patch('/api/v1/inventory/lots/lot-5')
        .send({
          variantId: 'var-1',
          quantity: 20,
          reason: 'Sin actor',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('MissingActor');
    });

    it('returns 400 when the use case rejects a historical lot edit', async () => {
      test.fakeUseCase.setNextResult(
        err(new BusinessRuleError(
          'El lote no puede editarse directamente porque tiene historial de consumo o ajustes previos.',
        )),
      );

      const res = await request(test.app)
        .patch('/api/v1/inventory/lots/lot-historical')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 30,
          reason: 'Intento editar lote histórico',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.message).toContain('historial');
    });

    it('returns 404 when lot does not exist', async () => {
      test.fakeUseCase.setNextResult(
        err(new NotFoundError('PurchaseLot', 'lot-nonexistent')),
      );

      const res = await request(test.app)
        .patch('/api/v1/inventory/lots/lot-nonexistent')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 20,
          reason: 'Lote inexistente',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when no editable fields (quantity or unitCost) are provided', async () => {
      const res = await request(test.app)
        .patch('/api/v1/inventory/lots/lot-5')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          reason: 'Sin cambios',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ValidationError');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // POST /inventory/lots/:lotId/adjustments (historical compensation)
  // ══════════════════════════════════════════════════════════════

  describe('POST /inventory/lots/:lotId/adjustments', () => {
    it('returns 200 with adjustment response on valid historical compensation', async () => {
      test.fakeUseCase.setNextResult(ok(makeAdjustmentResponse({
        adjustmentId: 'adj-comp-1',
        action: 'HISTORICAL_COMPENSATION',
        targetLotId: 'lot-hist',
        createdLotId: 'lot-comp',
        beforeQuantity: 5,
        afterQuantity: 0,
        beforeUnitCostCents: 4000,
        afterUnitCostCents: 6000,
        deltaQuantity: -5,
      })));

      const res = await request(test.app)
        .post('/api/v1/inventory/lots/lot-hist/adjustments')
        .set(ACTOR_HEADERS)
        .send({
          quantityDelta: -5,
          unitCost: 60,
          reason: 'Corrección de costo histórico',
          effectiveAt: '2026-05-15T00:00:00.000Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('HISTORICAL_COMPENSATION');
      expect(res.body.targetLotId).toBe('lot-hist');
      expect(res.body.createdLotId).toBe('lot-comp');
      expect(res.body.deltaQuantity).toBe(-5);

      const cmd = test.fakeUseCase.receivedCommands[0]!;
      expect(cmd.action).toBe('HISTORICAL_COMPENSATION');
      expect(cmd.lotId).toBe('lot-hist');
      expect(cmd.quantityDelta).toBe(-5);
      expect(cmd.unitCost).toBe(60);
    });

    it('returns 400 when actor headers are missing', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/lot-hist/adjustments')
        .send({
          quantityDelta: -3,
          reason: 'Sin actor',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('MissingActor');
    });

    it('returns 400 when reason is missing', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/lot-hist/adjustments')
        .set(ACTOR_HEADERS)
        .send({
          quantityDelta: -3,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ValidationError');
    });

    it('returns 400 when quantityDelta is zero', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/lot-hist/adjustments')
        .set(ACTOR_HEADERS)
        .send({
          quantityDelta: 0,
          reason: 'Delta cero',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ValidationError');
    });

    it('returns 404 when lot does not exist', async () => {
      test.fakeUseCase.setNextResult(
        err(new NotFoundError('PurchaseLot', 'lot-nonexistent')),
      );

      const res = await request(test.app)
        .post('/api/v1/inventory/lots/lot-nonexistent/adjustments')
        .set(ACTOR_HEADERS)
        .send({
          quantityDelta: -5,
          reason: 'Lote inexistente',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('accepts request without variantId and passes undefined to use case', async () => {
      // The spec says POST /inventory/lots/:lotId/adjustments does NOT
      // require variantId in the body — the use case derives it from the lot.
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/lot-hist/adjustments')
        .set(ACTOR_HEADERS)
        .send({
          quantityDelta: -5,
          unitCost: 30,
          reason: 'Sin variantId en el body',
        });

      expect(res.status).toBe(200);

      // Controller should NOT send a variantId when body omits it
      const cmd = test.fakeUseCase.receivedCommands[0]!;
      expect(cmd.action).toBe('HISTORICAL_COMPENSATION');
      expect(cmd.variantId).toBeUndefined();
    });

    it('accepts request with empty variantId and passes it through', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/lot-hist/adjustments')
        .set(ACTOR_HEADERS)
        .send({
          variantId: '',
          quantityDelta: -3,
          reason: 'Con variantId vacío',
        });

      expect(res.status).toBe(200);

      // Empty string passed through as-is (use case will derive from lot)
      const cmd = test.fakeUseCase.receivedCommands[0]!;
      expect(cmd.action).toBe('HISTORICAL_COMPENSATION');
      expect(cmd.variantId).toBe('');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Shared error cases
  // ══════════════════════════════════════════════════════════════

  describe('shared validation', () => {
    it('returns 400 for invalid effectiveAt date format', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 10,
          reason: 'Fecha inválida',
          effectiveAt: 'not-a-date',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ValidationError');
    });

    it('returns 400 when unitCost is negative', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .set(ACTOR_HEADERS)
        .send({
          variantId: 'var-1',
          quantity: 10,
          unitCost: -5,
          reason: 'Costo negativo',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ValidationError');
    });

    it('returns 400 for missing body on increase', async () => {
      const res = await request(test.app)
        .post('/api/v1/inventory/lots/adjustments/increase')
        .set(ACTOR_HEADERS)
        .set('content-type', 'application/json')
        .send('');

      expect(res.status).toBe(400);
    });
  });
});
