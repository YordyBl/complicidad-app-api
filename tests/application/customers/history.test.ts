/**
 * Application tests for GetCustomerHistoryUseCase.
 *
 * Verifies that customer purchase history is correctly derived from
 * sales data (not manually stored). Tests:
 * - Chronological ordering of sales
 * - Active sale totals (revenue, cost, profit)
 * - Cancelled sale exclusion from active totals
 * - Returned sale exclusion from active totals
 * - Mixed status summary counts
 * - Unknown customer rejection
 * - Customer with no sales (empty history)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GetCustomerHistoryUseCase } from '../../../src/modules/customers/application/use-cases/GetCustomerHistoryUseCase.js';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { SaleRepository } from '../../../src/modules/sales-returns/domain/SaleRepository.js';
import type { CustomerRepository } from '../../../src/modules/customers/domain/CustomerRepository.js';
import { Customer } from '../../../src/modules/customers/domain/Customer.js';
import { CustomerId } from '../../../src/modules/customers/domain/CustomerId.js';
import { Sale as SaleEntity } from '../../../src/modules/sales-returns/domain/Sale.js';
import { SaleId } from '../../../src/modules/sales-returns/domain/SaleId.js';
import { SaleLine } from '../../../src/modules/sales-returns/domain/SaleLine.js';
import { SaleLineId } from '../../../src/modules/sales-returns/domain/SaleLineId.js';
import { LotConsumptionRecord } from '../../../src/modules/sales-returns/domain/LotConsumptionRecord.js';
import { Money } from '../../../src/shared/domain/Money.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';
// ── Scope type ───────────────────────────────────────────────

interface HistoryTestScope extends UnitOfWorkScope {
  sales: SaleRepository;
}

// ── Fakes ────────────────────────────────────────────────────

class FakeCustomerRepository implements CustomerRepository {
  private customers = new Map<string, Customer>();

  setCustomer(c: Customer): void {
    this.customers.set(c.id.toString(), c);
  }

  async findById(id: CustomerId): Promise<Customer | null> {
    return this.customers.get(id.toString()) ?? null;
  }

  async save(customer: Customer): Promise<void> {
    this.customers.set(customer.id.toString(), customer);
  }

  async findAll(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }
}

class FakeSaleRepository implements SaleRepository {
  sales = new Map<string, SaleEntity>();

  async save(sale: SaleEntity): Promise<void> {
    this.sales.set(sale.id.toString(), sale);
  }

  async findById(id: SaleId): Promise<SaleEntity | null> {
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

class FakeUnitOfWork implements UnitOfWork {
  scope: HistoryTestScope;

  constructor(sales: SaleRepository) {
    this.scope = { sales };
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

function makeSaleLine(
  id: string,
  variantId: string,
  qty: number,
  unitPriceCents: number,
  unitCostCents: number,
): SaleLine {
  const consumptions = [makeConsumption(`cons-${id}`, `lot-${variantId}`, qty, unitCostCents)];
  return new SaleLine(
    SaleLineId.from(id),
    variantId,
    qty,
    Money.fromCents(unitPriceCents),
    'regular',
    consumptions,
  );
}

function createSale(
  id: string,
  customerId: string,
  channelReference: string | undefined,
  status: 'ACTIVE' | 'CANCELLED' | 'RETURNED',
  lines: SaleLine[],
  createdAt: Date,
  channel: 'tiktok' | 'facebook' | 'whatsapp' | 'web' | 'instagram' = 'web',
): SaleEntity {
  return new SaleEntity(
    SaleId.from(id),
    customerId,
    channelReference,
    channel,
    lines,
    status,
    createdAt,
    createdAt,
  );
}

function createTestCustomer(id?: string): Customer {
  return new Customer(
    CustomerId.from(id ?? 'cust-1'),
    'Test Customer',
    'test@example.com',
    '+1234567890',
    null, null, null, null,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('GetCustomerHistoryUseCase', () => {
  let customerRepo: FakeCustomerRepository;
  let saleRepo: FakeSaleRepository;
  let useCase: GetCustomerHistoryUseCase;
  let customer: Customer;

  beforeEach(() => {
    customer = createTestCustomer();
    customerRepo = new FakeCustomerRepository();
    customerRepo.setCustomer(customer);
    saleRepo = new FakeSaleRepository();
    useCase = new GetCustomerHistoryUseCase(customerRepo);
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork(saleRepo);
  }

  // ── Chronological history ─────────────────────────────────

  describe('chronological history', () => {
    it('returns sales in chronological order', async () => {
      const date1 = new Date('2026-02-01');
      const date2 = new Date('2026-03-15');
      const date3 = new Date('2026-04-20');

      const line1 = makeSaleLine('line-1', 'v1', 2, 2000, 800);
      const line2 = makeSaleLine('line-2', 'v1', 1, 3000, 800);
      const line3 = makeSaleLine('line-3', 'v2', 3, 1500, 500);

      saleRepo.sales.set('s-1', createSale('s-1', 'cust-1', 'shopify-1', 'ACTIVE', [line1], date1));
      saleRepo.sales.set('s-2', createSale('s-2', 'cust-1', 'shopify-2', 'ACTIVE', [line2], date2));
      saleRepo.sales.set('s-3', createSale('s-3', 'cust-1', 'shopify-3', 'ACTIVE', [line3], date3));

      const result = await useCase.execute({ customerId: 'cust-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.sales).toHaveLength(3);
      expect(result.value.sales[0]!.saleId).toBe('s-1');
      expect(result.value.sales[1]!.saleId).toBe('s-2');
      expect(result.value.sales[2]!.saleId).toBe('s-3');
    });
  });

  // ── Active sale totals ────────────────────────────────────

  describe('active sale totals', () => {
    it('includes only active sales in revenue/cost/profit totals', async () => {
      const baseDate = new Date('2026-01-01');
      // Active sale: 2 items at $20 each, cost $8 each → revenue 4000, cost 1600
      const line1 = makeSaleLine('line-1', 'v1', 2, 2000, 800);
      // Another active sale: 1 item at $30, cost $8 → revenue 3000, cost 800
      const line2 = makeSaleLine('line-2', 'v1', 1, 3000, 800);
      // Cancelled sale: 3 items at $15 each, cost $5 → revenue 4500, cost 1500
      const line3 = makeSaleLine('line-3', 'v2', 3, 1500, 500);
      // Returned sale: 1 item at $50, cost $20 → revenue 5000, cost 2000
      const line4 = makeSaleLine('line-4', 'v3', 1, 5000, 2000);

      saleRepo.sales.set('s-1', createSale('s-1', 'cust-1', 'shopify-1', 'ACTIVE', [line1], baseDate));
      saleRepo.sales.set('s-2', createSale('s-2', 'cust-1', 'shopify-2', 'ACTIVE', [line2], baseDate));
      saleRepo.sales.set('s-3', createSale('s-3', 'cust-1', 'shopify-3', 'CANCELLED', [line3], baseDate));
      saleRepo.sales.set('s-4', createSale('s-4', 'cust-1', 'shopify-4', 'RETURNED', [line4], baseDate));

      const result = await useCase.execute({ customerId: 'cust-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Active totals: revenue 4000+3000=7000, cost 1600+800=2400, profit 7000-2400=4600
      expect(result.value.summary.activeCount).toBe(2);
      expect(result.value.summary.cancelledCount).toBe(1);
      expect(result.value.summary.returnedCount).toBe(1);
      expect(result.value.summary.totalSales).toBe(4);
      expect(result.value.summary.totalRevenueCents).toBe(7000);
      expect(result.value.summary.totalCostCents).toBe(2400);
      expect(result.value.summary.grossProfitCents).toBe(4600);
    });

    it('returns zero totals when customer has no sales', async () => {
      const result = await useCase.execute({ customerId: 'cust-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.sales).toHaveLength(0);
      expect(result.value.summary.totalSales).toBe(0);
      expect(result.value.summary.activeCount).toBe(0);
      expect(result.value.summary.cancelledCount).toBe(0);
      expect(result.value.summary.returnedCount).toBe(0);
      expect(result.value.summary.totalRevenueCents).toBe(0);
      expect(result.value.summary.totalCostCents).toBe(0);
      expect(result.value.summary.grossProfitCents).toBe(0);
    });
  });

  // ── Sale summary with cancelled/returned statuses ─────────

  describe('sale summaries include status', () => {
    it('each sale in the list has correct status, revenue, cost, profit', async () => {
      const baseDate = new Date('2026-01-01');
      const line1 = makeSaleLine('line-1', 'v1', 2, 2000, 800);
      const line2 = makeSaleLine('line-2', 'v1', 1, 3000, 800);
      const line3 = makeSaleLine('line-3', 'v2', 3, 1500, 500);

      saleRepo.sales.set('s-1', createSale('s-1', 'cust-1', 'shopify-1', 'ACTIVE', [line1], baseDate));
      saleRepo.sales.set('s-2', createSale('s-2', 'cust-1', 'shopify-2', 'CANCELLED', [line2], baseDate));
      saleRepo.sales.set('s-3', createSale('s-3', 'cust-1', 'shopify-3', 'RETURNED', [line3], baseDate));

      const result = await useCase.execute({ customerId: 'cust-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sale1 = result.value.sales.find((s) => s.saleId === 's-1')!;
      expect(sale1.status).toBe('ACTIVE');
      expect(sale1.totalRevenueCents).toBe(4000);
      expect(sale1.channel).toBe('web');
      expect(sale1.channelReference).toBe('shopify-1');

      const sale2 = result.value.sales.find((s) => s.saleId === 's-2')!;
      expect(sale2.status).toBe('CANCELLED');
      expect(sale2.totalRevenueCents).toBe(3000);
      expect(sale2.channel).toBe('web');

      const sale3 = result.value.sales.find((s) => s.saleId === 's-3')!;
      expect(sale3.status).toBe('RETURNED');
      expect(sale3.totalRevenueCents).toBe(4500);
      expect(sale3.channel).toBe('web');
    });
  });

  // ── ChannelReference optional ────────────────────────────

  describe('channelReference in history', () => {
    it('returns channelReference as null for sale created without one', async () => {
      const baseDate = new Date('2026-01-01');
      const line = makeSaleLine('line-1', 'v1', 2, 2000, 800);

      saleRepo.sales.set('s-1', createSale('s-1', 'cust-1', undefined, 'ACTIVE', [line], baseDate));
      saleRepo.sales.set('s-2', createSale('s-2', 'cust-1', 'shopify-ref', 'ACTIVE', [line], baseDate));

      const result = await useCase.execute({ customerId: 'cust-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const saleWithoutRef = result.value.sales.find((s) => s.saleId === 's-1')!;
      expect(saleWithoutRef.channelReference).toBeNull();
      expect(saleWithoutRef.channel).toBe('web');

      const saleWithRef = result.value.sales.find((s) => s.saleId === 's-2')!;
      expect(saleWithRef.channelReference).toBe('shopify-ref');
      expect(saleWithRef.channel).toBe('web');
    });
  });

  // ── Unknown customer ──────────────────────────────────────

  describe('unknown customer', () => {
    it('rejects with NotFoundError when customer does not exist', async () => {
      const result = await useCase.execute({ customerId: 'non-existent' }, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(result.error.message).toContain('Customer');
    });
  });

  // ── Customer info in response ─────────────────────────────

  describe('customer info', () => {
    it('includes customer id and name in response', async () => {
      const result = await useCase.execute({ customerId: 'cust-1' }, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.customerId).toBe('cust-1');
      expect(result.value.customerName).toBe('Test Customer');
    });
  });
});
