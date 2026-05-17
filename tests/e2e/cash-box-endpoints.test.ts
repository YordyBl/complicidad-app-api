/**
 * E2E tests for Cash Box HTTP endpoints.
 *
 * Tests all `/api/v1/cash-boxes/*` endpoints using fakes injected into
 * an Express application with supertest.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { json, type Express } from 'express';
import { errorMiddleware } from '../../src/infrastructure/http/index.js';
import { CashBox } from '../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../src/modules/accounting-reports/domain/CashBoxId.js';
import { CashLedgerEntry } from '../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { Money } from '../../src/shared/domain/Money.js';
import { toLimaBusinessDate } from '../../src/modules/accounting-reports/domain/LimaBusinessDate.js';
import type { CashBoxRepository } from '../../src/modules/accounting-reports/domain/CashBoxRepository.js';
import type { CashLedgerRepository } from '../../src/modules/accounting-reports/domain/CashLedgerRepository.js';

import { OpenCashBoxUseCase } from '../../src/modules/accounting-reports/application/use-cases/OpenCashBoxUseCase.js';
import { CloseCashBoxUseCase } from '../../src/modules/accounting-reports/application/use-cases/CloseCashBoxUseCase.js';
import { GetCurrentCashBoxUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetCurrentCashBoxUseCase.js';
import { GetCashBoxSummaryUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetCashBoxSummaryUseCase.js';
import { AddManualMovementUseCase } from '../../src/modules/accounting-reports/application/use-cases/AddManualMovementUseCase.js';
import { ReverseMovementUseCase } from '../../src/modules/accounting-reports/application/use-cases/ReverseMovementUseCase.js';
import { GetCashBoxMovementsUseCase } from '../../src/modules/accounting-reports/application/use-cases/GetCashBoxMovementsUseCase.js';
import { CashBoxController } from '../../src/modules/accounting-reports/interfaces/http/CashBoxController.js';
import { createCashBoxRouter } from '../../src/modules/accounting-reports/interfaces/http/cash-box-routes.js';

// ── Fake repositories ─────────────────────────────────────────

class FakeCashBoxRepo implements CashBoxRepository {
  boxes = new Map<string, CashBox>();
  async save(box: CashBox): Promise<void> { this.boxes.set(box.id.toString(), box); }
  async findByBusinessDate(businessDate: string): Promise<CashBox | null> {
    for (const box of this.boxes.values()) { if (box.businessDate === businessDate) return box; }
    return null;
  }
  async findCurrent(): Promise<CashBox | null> {
    for (const box of this.boxes.values()) { if (box.isOpen()) return box; }
    return null;
  }
  async findById(id: CashBoxId): Promise<CashBox | null> { return this.boxes.get(id.toString()) ?? null; }
  async findAllOrdered(): Promise<CashBox[]> {
    return Array.from(this.boxes.values())
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  }
  async findLastClosed(): Promise<CashBox | null> {
    let last: CashBox | null = null;
    for (const box of this.boxes.values()) {
      if (box.isClosed() && (!last || box.businessDate > last.businessDate)) last = box;
    }
    return last;
  }
}

class FakeCashLedgerRepo implements CashLedgerRepository {
  entries: CashLedgerEntry[] = [];
  async append(entry: CashLedgerEntry): Promise<void> { this.entries.push(entry); }
  async findAllOrdered(): Promise<CashLedgerEntry[]> { return [...this.entries]; }
  async findById(id: CashLedgerEntryId): Promise<CashLedgerEntry | null> {
    return this.entries.find((e) => e.id.toString() === id.toString()) ?? null;
  }
  async findByCashBoxId(cashBoxId: string): Promise<CashLedgerEntry[]> {
    return this.entries.filter((e) => e.cashBoxId?.toString() === cashBoxId);
  }
}

// ── Test app factory ───────────────────────────────────────────

interface TestInfra {
  cashBoxRepo: FakeCashBoxRepo;
  cashLedgerRepo: FakeCashLedgerRepo;
  app: Express;
}

function createTestApp(): TestInfra {
  const cashBoxRepo = new FakeCashBoxRepo();
  const cashLedgerRepo = new FakeCashLedgerRepo();

  const openCashBoxUseCase = new OpenCashBoxUseCase(cashBoxRepo);
  const closeCashBoxUseCase = new CloseCashBoxUseCase(cashBoxRepo);
  const getCurrentCashBoxUseCase = new GetCurrentCashBoxUseCase(cashBoxRepo, cashLedgerRepo);
  const getCashBoxSummaryUseCase = new GetCashBoxSummaryUseCase(cashBoxRepo, cashLedgerRepo);
  const addManualMovementUseCase = new AddManualMovementUseCase(cashBoxRepo, cashLedgerRepo);
  const reverseMovementUseCase = new ReverseMovementUseCase(cashBoxRepo, cashLedgerRepo);
  const getCashBoxMovementsUseCase = new GetCashBoxMovementsUseCase(cashBoxRepo, cashLedgerRepo);

  const controller = new CashBoxController(
    openCashBoxUseCase,
    closeCashBoxUseCase,
    getCurrentCashBoxUseCase,
    getCashBoxSummaryUseCase,
    addManualMovementUseCase,
    getCashBoxMovementsUseCase,
    reverseMovementUseCase,
    cashBoxRepo,
  );

  const app = express();
  app.use(json());
  app.use('/api/v1', createCashBoxRouter(controller));
  app.use(errorMiddleware);

  return { cashBoxRepo, cashLedgerRepo, app };
}

// ── Helper to seed an OPEN cash box for today ──────────────────

function seedTodayBox(repo: FakeCashBoxRepo, status: 'OPEN' | 'CLOSED' = 'OPEN'): CashBox {
  const box = new CashBox({
    id: CashBoxId.generate(),
    businessDate: toLimaBusinessDate(new Date()),
    status,
    openingBalanceCents: 10000,
    currentBalanceCents: 10000,
    finalBalanceCents: status === 'CLOSED' ? 10000 : null,
    closedAt: status === 'CLOSED' ? new Date() : null,
    legacy: false,
    createdAt: new Date(),
  });
  void repo.save(box);
  return box;
}

// ── Tests ──────────────────────────────────────────────────────

describe('Cash Box HTTP endpoints', () => {
  let infra: TestInfra;
  let app: Express;

  beforeAll(() => {
    infra = createTestApp();
    app = infra.app;
  });

  describe('GET /api/v1/cash-boxes/current', () => {
    it('returns 200 with current open cash box including isCurrent', async () => {
      seedTodayBox(infra.cashBoxRepo, 'OPEN');
      const res = await request(app).get('/api/v1/cash-boxes/current');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.openingBalanceCents).toBe(10000);
      expect(res.body.isCurrent).toBe(true);
    });

    it('returns 404 when no open cash box exists', async () => {
      infra.cashBoxRepo.boxes.clear();
      const res = await request(app).get('/api/v1/cash-boxes/current');
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('No hay una caja abierta para hoy');
    });
  });

  describe('POST /api/v1/cash-boxes/open', () => {
    it('returns 201 when opening a new cash box', async () => {
      infra.cashBoxRepo.boxes.clear();
      const res = await request(app)
        .post('/api/v1/cash-boxes/open')
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.businessDate).toBe(toLimaBusinessDate(new Date()));
    });

    it('returns 400 when cash box already exists for today', async () => {
      seedTodayBox(infra.cashBoxRepo, 'OPEN');
      const res = await request(app)
        .post('/api/v1/cash-boxes/open')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BusinessRuleError');
    });
  });

  describe('POST /api/v1/cash-boxes/current/close', () => {
    it('returns 200 when closing an open cash box', async () => {
      seedTodayBox(infra.cashBoxRepo, 'OPEN');
      const res = await request(app)
        .post('/api/v1/cash-boxes/current/close')
        .send({ finalBalanceCents: 9500 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CLOSED');
      expect(res.body.finalBalanceCents).toBe(9500);
    });

    it('returns 400 when no open cash box exists', async () => {
      infra.cashBoxRepo.boxes.clear();
      const res = await request(app)
        .post('/api/v1/cash-boxes/current/close')
        .send({ finalBalanceCents: 0 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/cash-boxes', () => {
    it('returns 200 with list of all cash boxes', async () => {
      infra.cashBoxRepo.boxes.clear();
      seedTodayBox(infra.cashBoxRepo, 'OPEN');
      const b2 = new CashBox({
        id: CashBoxId.generate(),
        businessDate: '2026-05-14',
        status: 'CLOSED',
        openingBalanceCents: 0,
        currentBalanceCents: 5000,
        finalBalanceCents: 5000,
        closedAt: new Date(),
        legacy: false,
        createdAt: new Date(),
      });
      void infra.cashBoxRepo.save(b2);

      const res = await request(app).get('/api/v1/cash-boxes');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  describe('GET /api/v1/cash-boxes/:id', () => {
    it('returns 200 with cash box summary including netMovementCents', async () => {
      infra.cashBoxRepo.boxes.clear();
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      // Add a sale entry
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(5000), 'sale-1', null, new Date(),
        box.id, null,
      ));

      const res = await request(app).get(`/api/v1/cash-boxes/${box.id.toString()}`);
      expect(res.status).toBe(200);
      expect(res.body.cashBoxId).toBe(box.id.toString());
      expect(res.body.grossSalesCents).toBe(5000);
      expect(res.body.currentBalanceCents).toBe(15000); // 10000 opening + 5000
      // netMovementCents = sum of all signed movements (5000)
      expect(res.body.netMovementCents).toBe(5000);
    });

    it('returns 404 for non-existent cash box', async () => {
      const res = await request(app).get('/api/v1/cash-boxes/non-existent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/cash-boxes/current/movements', () => {
    it('returns 201 when adding a manual movement', async () => {
      infra.cashBoxRepo.boxes.clear();
      seedTodayBox(infra.cashBoxRepo, 'OPEN');
      const res = await request(app)
        .post('/api/v1/cash-boxes/current/movements')
        .send({ concept: 'Gasolina', amountCents: 2000, type: 'MANUAL_ADJUSTMENT' });
      expect(res.status).toBe(201);
      expect(res.body.concept).toBe('Gasolina');
      expect(res.body.amountCents).toBe(2000);
    });

    it('returns 400 when validation fails', async () => {
      infra.cashBoxRepo.boxes.clear();
      seedTodayBox(infra.cashBoxRepo, 'OPEN');
      const res = await request(app)
        .post('/api/v1/cash-boxes/current/movements')
        .send({ concept: '', amountCents: 0, type: 'INVALID' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no open cash box exists (box is closed)', async () => {
      infra.cashBoxRepo.boxes.clear();
      seedTodayBox(infra.cashBoxRepo, 'CLOSED');
      const res = await request(app)
        .post('/api/v1/cash-boxes/current/movements')
        .send({ concept: 'Gasolina', amountCents: 2000, type: 'MANUAL_ADJUSTMENT' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BusinessRuleError');
    });

    it('returns 400 when no cash box exists at all', async () => {
      infra.cashBoxRepo.boxes.clear();
      const res = await request(app)
        .post('/api/v1/cash-boxes/current/movements')
        .send({ concept: 'Gasolina', amountCents: 2000, type: 'MANUAL_ADJUSTMENT' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BusinessRuleError');
    });
  });

  describe('GET /api/v1/cash-boxes/:id/movements', () => {
    it('returns 200 with paginated movements', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      // Add multiple entries
      for (let i = 0; i < 15; i++) {
        void infra.cashLedgerRepo.append(new CashLedgerEntry(
          CashLedgerEntryId.generate(), 'SALE_INCOME',
          Money.fromCents(1000), `src-${i}`, null, new Date(),
          box.id, null,
        ));
      }

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?page=1&pageSize=5`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(5);
      expect(res.body.total).toBe(15);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(5);
      // All entries have profitCents field (null since no saleRepo in this test app)
      for (const entry of res.body.entries) {
        expect(entry).toHaveProperty('profitCents');
        expect(entry.profitCents).toBeNull();
      }
    });

    it('returns 404 for non-existent cash box', async () => {
      const res = await request(app).get('/api/v1/cash-boxes/non-existent/movements');
      expect(res.status).toBe(404);
    });

    it('filters movements by from date', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(1000), 'src-1', null, new Date('2026-05-10T08:00:00Z'),
        box.id, null,
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(2000), 'src-2', null, new Date('2026-05-14T10:00:00Z'),
        box.id, null,
      ));

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?from=2026-05-12`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]!.amountCents).toBe(2000);
    });

    it('filters movements by to date', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(1000), 'src-1', null, new Date('2026-05-10T08:00:00Z'),
        box.id, null,
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(2000), 'src-2', null, new Date('2026-05-14T10:00:00Z'),
        box.id, null,
      ));

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?to=2026-05-13`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]!.amountCents).toBe(1000);
    });

    it('filters movements by from and to date range', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(1000), 'src-1', null, new Date('2026-05-10T08:00:00Z'),
        box.id, null,
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(2000), 'src-2', null, new Date('2026-05-12T15:00:00Z'),
        box.id, null,
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'PURCHASE_OUTFLOW',
        Money.fromCents(-500), 'src-3', null, new Date('2026-05-14T10:00:00Z'),
        box.id, null,
      ));

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?from=2026-05-11&to=2026-05-13`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]!.amountCents).toBe(2000);
    });

    it('filters movements by type', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(1000), 'src-1', null, new Date(),
        box.id, null,
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'PURCHASE_OUTFLOW',
        Money.fromCents(-500), 'src-2', null, new Date(),
        box.id, null,
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(2000), 'src-3', null, new Date(),
        box.id, null,
      ));

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?type=SALE_INCOME`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(2);
      for (const entry of res.body.entries) {
        expect(entry.type).toBe('SALE_INCOME');
      }
    });

    it('filters movements by search (concept substring, case-insensitive)', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'MANUAL_ADJUSTMENT',
        Money.fromCents(500), 'manual-1', null, new Date(),
        box.id, 'Gasolina',
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'MANUAL_ADJUSTMENT',
        Money.fromCents(300), 'manual-2', null, new Date(),
        box.id, 'Viaticos',
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'MANUAL_ADJUSTMENT',
        Money.fromCents(200), 'manual-3', null, new Date(),
        box.id, 'gasolina estación',
      ));

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?search=gas`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(2);
      for (const entry of res.body.entries) {
        expect(entry.concept?.toLowerCase()).toContain('gas');
      }
    });

    it('filters movements by type and search combined', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(1000), 'src-1', null, new Date(),
        box.id, null,
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'PURCHASE_OUTFLOW',
        Money.fromCents(-500), 'src-2', null, new Date(),
        box.id, 'Gasolina',
      ));
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'MANUAL_ADJUSTMENT',
        Money.fromCents(200), 'manual', null, new Date(),
        box.id, 'Gasolina',
      ));

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?type=PURCHASE_OUTFLOW&search=gas`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]!.type).toBe('PURCHASE_OUTFLOW');
      expect(res.body.entries[0]!.concept?.toLowerCase()).toContain('gas');
    });

    it('returns empty entries when type filter matches nothing', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(1000), 'src-1', null, new Date(),
        box.id, null,
      ));

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?type=PURCHASE_OUTFLOW`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('returns empty entries when search filter matches nothing', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      void infra.cashLedgerRepo.append(new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'SALE_INCOME',
        Money.fromCents(1000), 'src-1', null, new Date(),
        box.id, null,
      ));

      const res = await request(app)
        .get(`/api/v1/cash-boxes/${box.id.toString()}/movements?search=nonexistent`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });

  describe('POST /api/v1/cash-boxes/current/movements/:movementId/reverse', () => {
    it('returns 200 when reversing a movement', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'OPEN');
      const entry = new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'MANUAL_ADJUSTMENT',
        Money.fromCents(2000), 'src', null, new Date(),
        box.id, 'test',
      );
      void infra.cashLedgerRepo.append(entry);

      const res = await request(app)
        .post(`/api/v1/cash-boxes/current/movements/${entry.id.toString()}/reverse`);
      expect(res.status).toBe(200);
      expect(res.body.reversedId).toBe(entry.id.toString());
      // Reversal should exist
      expect(infra.cashLedgerRepo.entries).toHaveLength(2);
    });

    it('returns 404 for non-existent movement', async () => {
      const res = await request(app)
        .post('/api/v1/cash-boxes/current/movements/non-existent/reverse');
      expect(res.status).toBe(404);
    });

    it('returns 400 when movement belongs to a closed cash box', async () => {
      infra.cashBoxRepo.boxes.clear();
      infra.cashLedgerRepo.entries = [];
      const box = seedTodayBox(infra.cashBoxRepo, 'CLOSED');
      const entry = new CashLedgerEntry(
        CashLedgerEntryId.generate(), 'MANUAL_ADJUSTMENT',
        Money.fromCents(2000), 'src', null, new Date(),
        box.id, 'test',
      );
      void infra.cashLedgerRepo.append(entry);

      const res = await request(app)
        .post(`/api/v1/cash-boxes/current/movements/${entry.id.toString()}/reverse`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BusinessRuleError');
    });
  });
});
