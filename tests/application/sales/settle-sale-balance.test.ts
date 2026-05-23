/**
 * Application tests for SettleSaleBalanceUseCase.
 *
 * Tests the full use case with fake repositories. Verifies:
 * - Single settlement closes pending balance (pending → paid)
 * - Single settlement closes partial balance (partial → paid)
 * - Duplicate settlement rejection (already paid)
 * - Open cash box enforcement
 * - SALE_SETTLEMENT_INCOME cash entry creation with correct amount and scope
 * - Transactional integrity / rollback on failure
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SettleSaleBalanceUseCase } from '../../../src/modules/sales-returns/application/use-cases/SettleSaleBalanceUseCase.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { CashLedgerRepository } from '../../../src/modules/accounting-reports/domain/CashLedgerRepository.js';
import type { CashBoxRepository } from '../../../src/modules/accounting-reports/domain/CashBoxRepository.js';
import { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { toLimaBusinessDate } from '../../../src/modules/accounting-reports/domain/LimaBusinessDate.js';
import { BusinessRuleError, NotFoundError } from '../../../src/shared/domain/errors.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId as SaleIdEntity } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { SaleLine } from '../../../src/modules/sales-returns/domain/SaleLine.js';
import { SaleLineId } from '../../../src/modules/sales-returns/domain/SaleLineId.js';
import { LotConsumptionRecord } from '../../../src/modules/sales-returns/domain/LotConsumptionRecord.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { SalePaymentError } from '../../../src/modules/sales-returns/domain/Sale.js';

// ── Scope type ───────────────────────────────────────────────

interface SettleTestScope extends UnitOfWorkScope {
  sales: SaleRepository;
  cashLedger: CashLedgerRepository;
  cashBoxes: CashBoxRepository;
}

// ── Fakes ────────────────────────────────────────────────────

class FakeSaleRepository implements SaleRepository {
  sales = new Map<string, SaleEntity>();

  async save(sale: SaleEntity): Promise<void> {
    this.sales.set(sale.id.toString(), sale);
  }

  async findById(id: SaleIdEntity): Promise<SaleEntity | null> {
    return this.sales.get(id.toString()) ?? null;
  }

  async findByCustomerId(customerId: string): Promise<SaleEntity[]> {
    return Array.from(this.sales.values())
      .filter((s) => s.customerId === customerId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findByIds(ids: SaleIdEntity[]): Promise<SaleEntity[]> {
    return ids.map((id) => this.sales.get(id.toString())).filter(Boolean) as SaleEntity[];
  }

  async findAll(): Promise<SaleEntity[]> {
    return Array.from(this.sales.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

class FakeCashLedgerRepository implements CashLedgerRepository {
  entries: CashLedgerEntry[] = [];

  async append(entry: CashLedgerEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findAllOrdered(): Promise<CashLedgerEntry[]> {
    return [...this.entries];
  }

  async findById(id: CashLedgerEntryId): Promise<CashLedgerEntry | null> {
    return this.entries.find((e) => e.id.toString() === id.toString()) ?? null;
  }

  async findByCashBoxId(cashBoxId: string): Promise<CashLedgerEntry[]> {
    return this.entries.filter((e) => e.cashBoxId?.toString() === cashBoxId);
  }
}

class FakeCashBoxRepository implements CashBoxRepository {
  boxes = new Map<string, CashBox>();

  async save(box: CashBox): Promise<void> {
    this.boxes.set(box.id.toString(), box);
  }

  async findByBusinessDate(businessDate: string): Promise<CashBox | null> {
    for (const box of this.boxes.values()) {
      if (box.businessDate === businessDate) return box;
    }
    return null;
  }

  async findCurrent(): Promise<CashBox | null> {
    for (const box of this.boxes.values()) {
      if (box.isOpen()) return box;
    }
    return null;
  }

  async findById(id: CashBoxId): Promise<CashBox | null> {
    return this.boxes.get(id.toString()) ?? null;
  }

  async findAllOrdered(): Promise<CashBox[]> {
    return Array.from(this.boxes.values())
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  }

  async findLastClosed(): Promise<CashBox | null> {
    let last: CashBox | null = null;
    for (const box of this.boxes.values()) {
      if (box.isClosed() && (!last || box.businessDate > last.businessDate)) {
        last = box;
      }
    }
    return last;
  }
}

class FakeUnitOfWork implements UnitOfWork {
  scope: SettleTestScope;

  constructor(
    sales: SaleRepository,
    cashLedger: CashLedgerRepository,
    cashBoxes: CashBoxRepository,
  ) {
    this.scope = { sales, cashLedger, cashBoxes };
  }

  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    return fn(this.scope);
  }
}

// ── Fixtures ─────────────────────────────────────────────────

function makeConsumption(
  id: string,
  lotId: string,
  qty: number,
  unitCostCents: number,
): LotConsumptionRecord {
  return new LotConsumptionRecord(
    id,
    lotId,
    qty,
    Money.fromCents(unitCostCents),
    Money.fromCents(unitCostCents * qty),
  );
}

/**
 * Create a "pending" sale: no payment at creation (zero paid).
 * Total revenue = 8 * 1000 = 8000 cents ($80.00).
 */
function createPendingSale(saleId: string): SaleEntity {
  const c1 = makeConsumption('c1', 'lot-a', 3, 200);
  const c2 = makeConsumption('c2', 'lot-b', 5, 300);
  const line = new SaleLine(
    SaleLineId.from('line-1'),
    'v1',
    8,
    Money.fromCents(1000),
    'regular',
    [c1, c2],
  );

  return new SaleEntity(
    SaleIdEntity.from(saleId),
    'customer-1',
    'ref-1',
    'web',
    [line],
    'ACTIVE',
    new Date('2026-01-15'),
    new Date('2026-01-15'),
    Money.ZERO,           // amountPaid = 0
    Money.fromCents(8000), // pendingBalance = 8000
    'pending',             // paymentStatus
    null,                  // settledAt
  );
}

/**
 * Create a "partial" sale: 3000 paid of 8000 total.
 */
function createPartialSale(saleId: string): SaleEntity {
  const c1 = makeConsumption('c1', 'lot-a', 3, 200);
  const c2 = makeConsumption('c2', 'lot-b', 5, 300);
  const line = new SaleLine(
    SaleLineId.from('line-1'),
    'v1',
    8,
    Money.fromCents(1000),
    'regular',
    [c1, c2],
  );

  return new SaleEntity(
    SaleIdEntity.from(saleId),
    'customer-1',
    'ref-2',
    'web',
    [line],
    'ACTIVE',
    new Date('2026-01-15'),
    new Date('2026-01-15'),
    Money.fromCents(3000), // amountPaid = 3000
    Money.fromCents(5000), // pendingBalance = 5000
    'partial',              // paymentStatus
    null,                   // settledAt
  );
}

/**
 * Create a "paid" sale: fully paid.
 */
function createPaidSale(saleId: string): SaleEntity {
  const c1 = makeConsumption('c1', 'lot-a', 2, 200);
  const line = new SaleLine(
    SaleLineId.from('line-1'),
    'v1',
    2,
    Money.fromCents(1000),
    'regular',
    [c1],
  );

  return new SaleEntity(
    SaleIdEntity.from(saleId),
    'customer-1',
    'ref-3',
    'web',
    [line],
    'ACTIVE',
    new Date('2026-01-15'),
    new Date('2026-01-15'),
    Money.fromCents(2000), // amountPaid = 2000
    Money.ZERO,             // pendingBalance = 0
    'paid',
    null,
  );
}

// ── SettleSaleBalanceUseCase tests ───────────────────────────

describe('SettleSaleBalanceUseCase', () => {
  let saleRepo: FakeSaleRepository;
  let cashRepo: FakeCashLedgerRepository;
  let cashBoxRepo: FakeCashBoxRepository;
  let useCase: SettleSaleBalanceUseCase;

  const TODAY_LIMA = toLimaBusinessDate(new Date());

  function ensureOpenCashBox(): string {
    const boxId = CashBoxId.generate();
    void cashBoxRepo.save(
      new CashBox({
        id: boxId,
        businessDate: TODAY_LIMA,
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 0,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date(),
      }),
    );
    return boxId.toString();
  }

  beforeEach(() => {
    saleRepo = new FakeSaleRepository();
    cashRepo = new FakeCashLedgerRepository();
    cashBoxRepo = new FakeCashBoxRepository();
    ensureOpenCashBox();
    useCase = new SettleSaleBalanceUseCase();
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork(saleRepo, cashRepo, cashBoxRepo);
  }

  // ── Single settlement success ──────────────────────────────

  describe('single settlement — pending → paid', () => {
    it('settles a pending sale, zeroes pendingBalance, sets paymentStatus to paid', async () => {
      const sale = createPendingSale('settle-pending-1');
      saleRepo.sales.set('settle-pending-1', sale);

      const result = await useCase.execute({ saleId: 'settle-pending-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const updatedSale = saleRepo.sales.get('settle-pending-1')!;
      expect(updatedSale.paymentStatus).toBe('paid');
      expect(updatedSale.pendingBalance.cents).toBe(0);
      expect(updatedSale.amountPaid.cents).toBe(8000); // 0 + 8000
      expect(updatedSale.settledAt).not.toBeNull();
    });

    it('settles a partial sale, zeroes pendingBalance, sets paymentStatus to paid', async () => {
      const sale = createPartialSale('settle-partial-1');
      saleRepo.sales.set('settle-partial-1', sale);

      const result = await useCase.execute({ saleId: 'settle-partial-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const updatedSale = saleRepo.sales.get('settle-partial-1')!;
      expect(updatedSale.paymentStatus).toBe('paid');
      expect(updatedSale.pendingBalance.cents).toBe(0);
      expect(updatedSale.amountPaid.cents).toBe(8000); // 3000 + 5000
      expect(updatedSale.settledAt).not.toBeNull();
    });
  });

  // ── Duplicate / invalid settlement ────────────────────────

  describe('rejection cases', () => {
    it('rejects settlement when sale is already paid (pendingBalance = 0)', async () => {
      const sale = createPaidSale('already-paid');
      saleRepo.sales.set('already-paid', sale);

      const result = await useCase.execute({ saleId: 'already-paid' }, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SalePaymentError);
      expect(result.error.message).toContain('ya fue saldada');
    });

    it('rejects settlement for a non-existent sale', async () => {
      const result = await useCase.execute({ saleId: 'non-existent' }, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });

    it('rejects settlement when sale has been cancelled', async () => {
      const sale = createPaidSale('cancelled-sale');
      sale.cancel(); // Paid sale can be cancelled
      saleRepo.sales.set('cancelled-sale', sale);

      const result = await useCase.execute({ saleId: 'cancelled-sale' }, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SalePaymentError);
    });
  });

  // ── Open cash box enforcement ──────────────────────────────

  describe('open cash box enforcement', () => {
    it('rejects settlement when no cash box is open for today', async () => {
      const sale = createPendingSale('settle-no-caja');
      saleRepo.sales.set('settle-no-caja', sale);

      const emptyBoxRepo = new FakeCashBoxRepository();
      const uow = new FakeUnitOfWork(saleRepo, cashRepo, emptyBoxRepo);

      const result = await useCase.execute({ saleId: 'settle-no-caja' }, uow);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('caja abierta');
    });

    it('rejects settlement when today cash box is closed', async () => {
      const sale = createPendingSale('settle-closed-caja');
      saleRepo.sales.set('settle-closed-caja', sale);

      const closedBox = new CashBox({
        id: CashBoxId.generate(),
        businessDate: TODAY_LIMA,
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 0,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date(),
      });
      const closed = closedBox.close(0);
      const closedBoxRepo = new FakeCashBoxRepository();
      closedBoxRepo.findByBusinessDate = async () => closed;
      const uow = new FakeUnitOfWork(saleRepo, cashRepo, closedBoxRepo);

      const result = await useCase.execute({ saleId: 'settle-closed-caja' }, uow);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });
  });

  // ── SALE_SETTLEMENT_INCOME cash entry ──────────────────────

  describe('cash entry creation', () => {
    it('creates a SALE_SETTLEMENT_INCOME entry for the pending balance amount', async () => {
      const sale = createPendingSale('settle-cash-1');
      saleRepo.sales.set('settle-cash-1', sale);

      const result = await useCase.execute({ saleId: 'settle-cash-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(cashRepo.entries).toHaveLength(1);
      const entry = cashRepo.entries[0]!;
      expect(entry.type).toBe('SALE_SETTLEMENT_INCOME');
      expect(entry.amount.cents).toBe(8000); // pending balance
      expect(entry.amount.isPositive()).toBe(true);
      expect(entry.sourceId).toBe('settle-cash-1');
    });

    it('creates a SALE_SETTLEMENT_INCOME entry for the partial remaining amount', async () => {
      const sale = createPartialSale('settle-cash-2');
      saleRepo.sales.set('settle-cash-2', sale);

      const result = await useCase.execute({ saleId: 'settle-cash-2' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(cashRepo.entries).toHaveLength(1);
      const entry = cashRepo.entries[0]!;
      expect(entry.type).toBe('SALE_SETTLEMENT_INCOME');
      expect(entry.amount.cents).toBe(5000); // remaining balance only
      expect(entry.amount.isPositive()).toBe(true);
      expect(entry.sourceId).toBe('settle-cash-2');
    });

    it('scopes the cash entry to today open cash box', async () => {
      const sale = createPendingSale('settle-scoped');
      saleRepo.sales.set('settle-scoped', sale);

      const result = await useCase.execute({ saleId: 'settle-scoped' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const entry = cashRepo.entries[0]!;
      expect(entry.cashBoxId).not.toBeNull();
    });
  });

  // ── Cash box isolation ────────────────────────────────────

  describe('cash box isolation — settlement credits only collection day', () => {
    it('adds settlement entry to today cash box, does NOT restate original sale-day cash box', async () => {
      // ── Set up sale registered on 2026-01-15 with partial payment ──
      const sale = createPartialSale('iso-sale');
      saleRepo.sales.set('iso-sale', sale);

      // ── Seed an open cash box for the original sale day (2026-01-15) ──
      const saleDayBoxId = CashBoxId.generate();
      void cashBoxRepo.save(
        new CashBox({
          id: saleDayBoxId,
          businessDate: '2026-01-15',
          status: 'OPEN',
          openingBalanceCents: 0,
          currentBalanceCents: 0,
          finalBalanceCents: null,
          closedAt: null,
          legacy: false,
          createdAt: new Date('2026-01-15'),
        }),
      );

      // Pre-populate the sale-day box with one entry (the partial SALE_INCOME)
      void cashRepo.append(
        new CashLedgerEntry(
          CashLedgerEntryId.generate(),
          'SALE_INCOME',
          Money.fromCents(3000),
          'iso-sale',
          null,
          new Date('2026-01-15'),
          saleDayBoxId,
          null,
        ),
      );

      // ── Ensure today has its own open cash box (the settlement day) ──
      // ensureOpenCashBox() was already called in beforeEach; let's get its ID
      const todayBoxes = Array.from(cashBoxRepo.boxes.values());
      const todayBoxId = todayBoxes.find((b) => b.businessDate === TODAY_LIMA)?.id.toString();

      // Count entries in today's box BEFORE settlement
      const todayEntriesBefore = cashRepo.entries.filter(
        (e) => e.cashBoxId?.toString() === todayBoxId,
      ).length;

      // Count entries in sale-day box BEFORE settlement
      const saleDayEntriesBefore = cashRepo.entries.filter(
        (e) => e.cashBoxId?.toString() === saleDayBoxId.toString(),
      ).length;
      expect(saleDayEntriesBefore).toBe(1); // only the original SALE_INCOME

      // ── Settle the sale ──
      const result = await useCase.execute({ saleId: 'iso-sale' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // ── Assert settlement entry landed on TODAY's box ──
      const settlementEntry = cashRepo.entries.find(
        (e) => e.type === 'SALE_SETTLEMENT_INCOME' && e.sourceId === 'iso-sale',
      );
      expect(settlementEntry).toBeDefined();
      expect(settlementEntry!.cashBoxId?.toString()).toBe(todayBoxId);
      expect(settlementEntry!.amount.cents).toBe(5000); // pending balance from partial sale

      // Additional sales income on today's box
      const todayEntriesAfter = cashRepo.entries.filter(
        (e) => e.cashBoxId?.toString() === todayBoxId,
      );
      expect(todayEntriesAfter.length).toBe(todayEntriesBefore + 1);

      // ── Assert original sale-day box is UNCHANGED ──
      const saleDayEntriesAfter = cashRepo.entries.filter(
        (e) => e.cashBoxId?.toString() === saleDayBoxId.toString(),
      );
      expect(saleDayEntriesAfter.length).toBe(saleDayEntriesBefore); // still only 1
      // Verify it's still the same original entry, not a new one from settlement
      for (const e of saleDayEntriesAfter) {
        expect(e.type).not.toBe('SALE_SETTLEMENT_INCOME');
      }

      // ── Assert the sale-day cash box itself was not modified ──
      const saleDayBox = cashBoxRepo.boxes.get(saleDayBoxId.toString());
      expect(saleDayBox).toBeDefined();
      expect(saleDayBox!.businessDate).toBe('2026-01-15');
    });
  });

  // ── Transactional integrity ───────────────────────────────

  describe('transactional integrity', () => {
    it('does not mutate sale state when settlement fails (e.g. already paid)', async () => {
      const sale = createPaidSale('tx-paid');
      saleRepo.sales.set('tx-paid', sale);

      const result = await useCase.execute({ saleId: 'tx-paid' }, createUow());

      expect(result.ok).toBe(false);

      // Sale must remain unchanged
      const persistedSale = saleRepo.sales.get('tx-paid')!;
      expect(persistedSale.paymentStatus).toBe('paid');
      expect(persistedSale.pendingBalance.cents).toBe(0);
      expect(persistedSale.amountPaid.cents).toBe(2000);

      // No cash entry created
      expect(cashRepo.entries).toHaveLength(0);
    });
  });
});
