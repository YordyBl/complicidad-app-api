/**
 * Application tests for CancelSaleUseCase and ReturnFullSaleUseCase.
 *
 * Tests the full use cases with fake repositories. Verifies:
 * - Exact lot restoration from consumption records
 * - Cancellation of multi-lot sale
 * - Double cancellation rejection
 * - Cash reversal (negative SALE_INCOME)
 * - Return creates RETURN_OUTFLOW cash entry
 * - Transaction rollback on failure
 * - Reports-facing totals adjustment readiness
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CancelSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/CancelSaleUseCase.js';
import { ReturnFullSaleUseCase } from '../../../src/modules/sales-returns/application/use-cases/ReturnFullSaleUseCase.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { InventoryLotRepository } from '../../../src/modules/inventory/domain/InventoryLotRepository.js';
import type { CashLedgerRepository } from '../../../src/modules/accounting-reports/domain/CashLedgerRepository.js';
import type { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import type { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import type { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import type { CashBoxRepository } from '../../../src/modules/accounting-reports/domain/CashBoxRepository.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { toLimaBusinessDate } from '../../../src/modules/accounting-reports/domain/LimaBusinessDate.js';
import { BusinessRuleError } from '../../../src/shared/domain/errors.js';
import type { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import { PurchaseLot as PurchaseLotEntity } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import type { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { PurchaseLotId as PurchaseLotIdEntity } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { PurchaseId as PurchaseIdEntity } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { VariantId as VariantIdEntity } from '../../../src/modules/inventory/domain/VariantId.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId as SaleIdEntity } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { SaleLine } from '../../../src/modules/sales-returns/domain/SaleLine.js';
import { SaleLineId } from '../../../src/modules/sales-returns/domain/SaleLineId.js';
import { LotConsumptionRecord } from '../../../src/modules/sales-returns/domain/LotConsumptionRecord.js';
import { SaleStatusError } from '../../../src/modules/sales-returns/domain/Sale.js';

// ── Scope type ───────────────────────────────────────────────

interface CancelTestScope extends UnitOfWorkScope {
  sales: SaleRepository;
  inventoryLots: InventoryLotRepository;
  cashLedger: CashLedgerRepository;
  cashBoxes: CashBoxRepository;
}

// ── Fakes ────────────────────────────────────────────────────

class FakeInventoryLotRepository implements InventoryLotRepository {
  lots = new Map<string, PurchaseLot>();

  async findById(id: PurchaseLotId): Promise<PurchaseLot | null> {
    return this.lots.get(id.toString()) ?? null;
  }

  async findByIds(ids: PurchaseLotId[]): Promise<PurchaseLot[]> {
    return ids
      .map((id) => this.lots.get(id.toString()))
      .filter((l): l is PurchaseLot => l !== undefined);
  }

  async findByVariantIdOrderedByDate(_variantId: VariantId, _lock?: boolean): Promise<PurchaseLot[]> {
    return Array.from(this.lots.values())
      .filter((l) => l.variantId.equals(_variantId))
      .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());
  }

  async save(lot: PurchaseLot): Promise<void> {
    this.lots.set(lot.id.toString(), lot);
  }

  async saveMany(lots: PurchaseLot[]): Promise<void> {
    for (const lot of lots) {
      this.lots.set(lot.id.toString(), lot);
    }
  }

  async delete(id: PurchaseLotId): Promise<void> {
    this.lots.delete(id.toString());
  }
}

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
  scope: CancelTestScope;

  constructor(
    sales: SaleRepository,
    inventoryLots: InventoryLotRepository,
    cashLedger: CashLedgerRepository,
    cashBoxes: CashBoxRepository,
  ) {
    this.scope = { sales, inventoryLots, cashLedger, cashBoxes };
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

function makeTestLot(
  id: string,
  variantId: string,
  purchasedQty: number,
  remainingQty: number,
  unitCostCents: number,
): PurchaseLotEntity {
  return new PurchaseLotEntity(
    PurchaseLotIdEntity.from(id),
    VariantIdEntity.from(variantId),
    PurchaseIdEntity.generate(),
    purchasedQty,
    remainingQty,
    Money.fromCents(unitCostCents),
    new Date('2026-01-01'),
    null,
  );
}

function createPopulatedSale(
  saleId: string,
): { sale: SaleEntity; lotA: PurchaseLotEntity; lotB: PurchaseLotEntity } {
  // Sale has one line with consumptions from two lots (FIFO)
  const c1 = makeConsumption('c1', 'lot-a', 5, 200); // 5 * 200 = 1000
  const c2 = makeConsumption('c2', 'lot-b', 3, 300); // 3 * 300 = 900
  const line = new SaleLine(
    SaleLineId.from('line-1'),
    'v1',
    8, // total quantity
    Money.fromCents(1000), // unit price
    'regular',
    [c1, c2],
  );

  const sale = new SaleEntity(
    SaleIdEntity.from(saleId),
    'customer-1',
    'web-order-456',
    'web',
    [line],
    'ACTIVE',
    new Date('2026-01-15'),
    new Date('2026-01-15'),
  );

  // Lots with some remaining (partially consumed)
  const lotA = makeTestLot('lot-a', 'v1', 20, 15, 200); // 5 consumed
  const lotB = makeTestLot('lot-b', 'v1', 20, 17, 300); // 3 consumed

  return { sale, lotA, lotB };
}

// ── CancelSaleUseCase tests ──────────────────────────────────

describe('CancelSaleUseCase', () => {
  let lotRepo: FakeInventoryLotRepository;
  let saleRepo: FakeSaleRepository;
  let cashRepo: FakeCashLedgerRepository;
  let cashBoxRepo: FakeCashBoxRepository;
  let useCase: CancelSaleUseCase;

  const TODAY_LIMA = toLimaBusinessDate(new Date());

  function ensureOpenCashBox(): void {
    void cashBoxRepo.save(
      new CashBox({
        id: CashBoxId.generate(),
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
  }

  beforeEach(() => {
    lotRepo = new FakeInventoryLotRepository();
    saleRepo = new FakeSaleRepository();
    cashRepo = new FakeCashLedgerRepository();
    cashBoxRepo = new FakeCashBoxRepository();
    ensureOpenCashBox();
    useCase = new CancelSaleUseCase();
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork(saleRepo, lotRepo, cashRepo, cashBoxRepo);
  }

  describe('open caja enforcement', () => {
    it('rejects cancellation when no cash box is open for today', async () => {
      const emptyBoxRepo = new FakeCashBoxRepository();
      const uow = new FakeUnitOfWork(saleRepo, lotRepo, cashRepo, emptyBoxRepo);

      const { sale, lotA, lotB } = createPopulatedSale('sale-caja-1');
      saleRepo.sales.set('sale-caja-1', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'sale-caja-1' }, uow);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('caja abierta');
    });
  });

  describe('exact lot restoration', () => {
    it('cancels a sale and restores exact consumption quantities to their lots', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('sale-1');
      saleRepo.sales.set('sale-1', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'sale-1' }, createUow());
      expect(result.ok).toBe(true);

      // Lots restored to full purchased quantity
      expect(lotRepo.lots.get('lot-a')?.remainingQuantity).toBe(20); // 15 + 5
      expect(lotRepo.lots.get('lot-b')?.remainingQuantity).toBe(20); // 17 + 3

      // Sale status is cancelled
      expect(saleRepo.sales.get('sale-1')?.status).toBe('CANCELLED');
    });

    it('handles single-lot sale correctly', async () => {
      const c = makeConsumption('c1', 'lot-1', 10, 500);
      const line = new SaleLine(
        SaleLineId.from('line-1'), 'v1', 10, Money.fromCents(2000), 'regular', [c],
      );
      const sale = new SaleEntity(
        SaleIdEntity.from('sale-single'), 'customer-1', 'channel-1', 'web', [line], 'ACTIVE', new Date(), new Date(),
      );
      const lot = makeTestLot('lot-1', 'v1', 30, 20, 500);

      saleRepo.sales.set('sale-single', sale);
      lotRepo.lots.set('lot-1', lot);

      const result = await useCase.execute({ saleId: 'sale-single' }, createUow());
      expect(result.ok).toBe(true);
      expect(lotRepo.lots.get('lot-1')?.remainingQuantity).toBe(30); // 20 + 10
    });
  });

  describe('double cancellation rejection', () => {
    it('rejects cancelling an already cancelled sale', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('sale-2');
      sale.cancel(); // already cancelled
      saleRepo.sales.set('sale-2', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'sale-2' }, createUow());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SaleStatusError);
      expect(result.error.message).toContain('already cancelled');
    });

    it('rejects cancelling a returned sale', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('sale-3');
      sale.markReturned();
      saleRepo.sales.set('sale-3', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'sale-3' }, createUow());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SaleStatusError);
      expect(result.error.message).toContain('Cannot cancel a returned sale');
    });

    it('rejects cancelling a non-existent sale', async () => {
      const result = await useCase.execute({ saleId: 'non-existent' }, createUow());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  describe('cash reversal', () => {
    it('creates a negative SALE_INCOME cash entry that exactly reverses the sale', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('sale-4');
      // Revenue: 8 * 1000 = 8000
      saleRepo.sales.set('sale-4', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'sale-4' }, createUow());
      expect(result.ok).toBe(true);

      // Should have exactly one reversal entry
      expect(cashRepo.entries).toHaveLength(1);
      const entry = cashRepo.entries[0]!;

      // Type should be SALE_INCOME (same as original, but negative)
      expect(entry.type).toBe('SALE_INCOME');
      // Amount should be negative of the original revenue
      expect(entry.amount.cents).toBe(-8000);
      expect(entry.amount.isNegative()).toBe(true);
      // Reference back to the sale
      expect(entry.sourceId).toBe('sale-4');
    });
  });

  describe('transactional integrity', () => {
    it('rolls back on failure, leaving sale and lots unchanged', async () => {
      // Create a sale but don't add the referenced lots → will fail restoration
      const c = makeConsumption('c1', 'non-existent-lot', 5, 200);
      const line = new SaleLine(
        SaleLineId.from('line-1'), 'v1', 5, Money.fromCents(1000), 'regular', [c],
      );
      const sale = new SaleEntity(
        SaleIdEntity.from('sale-fail'), 'customer-1', 'channel-1', 'web', [line], 'ACTIVE', new Date(), new Date(),
      );
      saleRepo.sales.set('sale-fail', sale);

      // No lots in the repo → will fail restoration
      const result = await useCase.execute({ saleId: 'sale-fail' }, createUow());

      expect(result.ok).toBe(false);

      // Sale should still be ACTIVE (not cancelled)
      expect(saleRepo.sales.get('sale-fail')?.status).toBe('ACTIVE');

      // No cash entry should have been created
      expect(cashRepo.entries).toHaveLength(0);
    });
  });
});

// ── ReturnFullSaleUseCase tests ──────────────────────────────

describe('ReturnFullSaleUseCase', () => {
  let lotRepo: FakeInventoryLotRepository;
  let saleRepo: FakeSaleRepository;
  let cashRepo: FakeCashLedgerRepository;
  let cashBoxRepo: FakeCashBoxRepository;
  let useCase: ReturnFullSaleUseCase;

  const TODAY_LIMA = toLimaBusinessDate(new Date());

  function ensureOpenCashBox(): void {
    void cashBoxRepo.save(
      new CashBox({
        id: CashBoxId.generate(),
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
  }

  beforeEach(() => {
    lotRepo = new FakeInventoryLotRepository();
    saleRepo = new FakeSaleRepository();
    cashRepo = new FakeCashLedgerRepository();
    cashBoxRepo = new FakeCashBoxRepository();
    ensureOpenCashBox();
    useCase = new ReturnFullSaleUseCase();
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork(saleRepo, lotRepo, cashRepo, cashBoxRepo);
  }

  describe('open caja enforcement', () => {
    it('rejects return when no cash box is open for today', async () => {
      const emptyBoxRepo = new FakeCashBoxRepository();
      const uow = new FakeUnitOfWork(saleRepo, lotRepo, cashRepo, emptyBoxRepo);

      const { sale, lotA, lotB } = createPopulatedSale('return-caja-1');
      saleRepo.sales.set('return-caja-1', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'return-caja-1' }, uow);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('caja abierta');
    });
  });

  describe('exact lot restoration', () => {
    it('returns a sale and restores exact consumed quantities to their lots', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('return-sale-1');
      saleRepo.sales.set('return-sale-1', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'return-sale-1' }, createUow());
      expect(result.ok).toBe(true);

      expect(lotRepo.lots.get('lot-a')?.remainingQuantity).toBe(20);
      expect(lotRepo.lots.get('lot-b')?.remainingQuantity).toBe(20);
      expect(saleRepo.sales.get('return-sale-1')?.status).toBe('RETURNED');
    });
  });

  describe('double return rejection', () => {
    it('rejects returning an already returned sale', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('return-sale-2');
      sale.markReturned();
      saleRepo.sales.set('return-sale-2', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'return-sale-2' }, createUow());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SaleStatusError);
      expect(result.error.message).toContain('already been returned');
    });

    it('rejects returning a cancelled sale', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('return-sale-3');
      sale.cancel();
      saleRepo.sales.set('return-sale-3', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'return-sale-3' }, createUow());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(SaleStatusError);
    });
  });

  describe('cash reversal', () => {
    it('creates a RETURN_OUTFLOW cash entry for the returned amount', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('return-sale-4');
      saleRepo.sales.set('return-sale-4', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'return-sale-4' }, createUow());
      expect(result.ok).toBe(true);

      expect(cashRepo.entries).toHaveLength(1);
      const entry = cashRepo.entries[0]!;
      expect(entry.type).toBe('RETURN_OUTFLOW');
      expect(entry.amount.cents).toBe(-8000); // 8 * 1000, negative (cash leaving)
      expect(entry.amount.isNegative()).toBe(true);
      expect(entry.sourceId).toBe('return-sale-4');
    });
  });

  describe('reports-facing totals adjustment readiness', () => {
    it('sale total cost and revenue remain accessible after return for report calculations', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('report-sale');
      saleRepo.sales.set('report-sale', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      const result = await useCase.execute({ saleId: 'report-sale' }, createUow());
      expect(result.ok).toBe(true);

      // After return, the sale entity still holds its derivable totals
      const returnedSale = saleRepo.sales.get('report-sale')!;
      expect(returnedSale.status).toBe('RETURNED');
      expect(returnedSale.totalRevenue.cents).toBe(8000);
      expect(returnedSale.totalCost.cents).toBe(1900); // 5*200 + 3*300
      expect(returnedSale.grossProfit.cents).toBe(6100);
    });

    it('cash entry correctly offsets SALE_INCOME for net reporting', async () => {
      const { sale, lotA, lotB } = createPopulatedSale('cash-report');
      saleRepo.sales.set('cash-report', sale);
      lotRepo.lots.set('lot-a', lotA);
      lotRepo.lots.set('lot-b', lotB);

      // First, simulate the original SALE_INCOME entry
      cashRepo.entries.push({
        id: { toString: () => 'orig-entry' },
        type: 'SALE_INCOME',
        amount: Money.fromCents(8000),
        sourceId: 'cash-report',
        tag: null,
        createdAt: new Date(),
      } as unknown as CashLedgerEntry);

      const result = await useCase.execute({ saleId: 'cash-report' }, createUow());
      expect(result.ok).toBe(true);

      expect(cashRepo.entries).toHaveLength(2);

      // Net sale income after return: 8000 (sale) + ... RETURN_OUTFLOW is tracked separately
      const incomeEntries = cashRepo.entries.filter((e) => e.type === 'SALE_INCOME');
      const returnEntries = cashRepo.entries.filter((e) => e.type === 'RETURN_OUTFLOW');

      expect(incomeEntries).toHaveLength(1);
      expect(incomeEntries[0]!.amount.cents).toBe(8000);

      expect(returnEntries).toHaveLength(1);
      expect(returnEntries[0]!.amount.cents).toBe(-8000);
    });
  });

  describe('transaction rollback', () => {
    it('rolls back return on failure, keeping sale active and lots unchanged', async () => {
      const c = makeConsumption('c1', 'missing-lot', 5, 200);
      const line = new SaleLine(
        SaleLineId.from('line-1'), 'v1', 5, Money.fromCents(1000), 'regular', [c],
      );
      const sale = new SaleEntity(
        SaleIdEntity.from('return-fail'), 'customer-1', 'channel-1', 'web', [line], 'ACTIVE', new Date(), new Date(),
      );
      saleRepo.sales.set('return-fail', sale);

      const result = await useCase.execute({ saleId: 'return-fail' }, createUow());
      expect(result.ok).toBe(false);
      expect(saleRepo.sales.get('return-fail')?.status).toBe('ACTIVE');
      expect(cashRepo.entries).toHaveLength(0);
    });
  });
});
