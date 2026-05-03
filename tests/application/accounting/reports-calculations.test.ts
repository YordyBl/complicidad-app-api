/**
 * Application tests for report calculation use cases.
 *
 * Tests each report use case with a fake ReportReadRepository.
 * Verifies:
 * - Liquidity from cash ledger (excludes stock value)
 * - Stock investment from FIFO lots
 * - Sales income from active sales only
 * - FIFO COGS from active sale consumptions
 * - Gross profit (sales income - COGS)
 * - Reinvestment from purchase outflows
 * - Operating capital (liquidity + stock investment)
 * - Stock by product grouping
 * - Open and exhausted lot reports
 * - Cash close creation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GetLiquidityUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetLiquidityUseCase.js';
import { GetStockInvestmentUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetStockInvestmentUseCase.js';
import { GetSalesTotalUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetSalesTotalUseCase.js';
import { GetFifoCostsUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetFifoCostsUseCase.js';
import { GetGrossProfitUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetGrossProfitUseCase.js';
import { GetReinvestmentUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetReinvestmentUseCase.js';
import { GetOperatingCapitalUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetOperatingCapitalUseCase.js';
import { GetStockByProductUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetStockByProductUseCase.js';
import { GetLotsUseCase } from '../../../src/modules/accounting-reports/application/use-cases/GetLotsUseCase.js';
import { ManualCashCloseUseCase } from '../../../src/modules/accounting-reports/application/use-cases/ManualCashCloseUseCase.js';
import type {
  ReportReadRepository,
  StockByProductItem,
  LotReportItem,
} from '../../../src/modules/accounting-reports/domain/ReportReadRepository.js';
import type { CashClosingRepository } from '../../../src/modules/accounting-reports/domain/CashClosingRepository.js';
import type { CashClosing } from '../../../src/modules/accounting-reports/domain/CashClosing.js';

// ── Fake ReportReadRepository ─────────────────────────────────

class FakeReportReadRepository implements ReportReadRepository {
  liquidityCentsValue = 0;
  stockInvestmentCentsValue = 0;
  salesIncomeCentsValue = 0;
  fifoCostsCentsValue = 0;
  reinvestmentCentsValue = 0;
  stockByProductValue: StockByProductItem[] = [];
  lotsValue: LotReportItem[] = [];

  async getLiquidityCents(): Promise<number> {
    return this.liquidityCentsValue;
  }

  async getStockInvestmentCents(): Promise<number> {
    return this.stockInvestmentCentsValue;
  }

  async getSalesIncomeCents(): Promise<number> {
    return this.salesIncomeCentsValue;
  }

  async getFifoCostsCents(): Promise<number> {
    return this.fifoCostsCentsValue;
  }

  async getReinvestmentCents(): Promise<number> {
    return this.reinvestmentCentsValue;
  }

  async getStockByProduct(): Promise<StockByProductItem[]> {
    return this.stockByProductValue;
  }

  async getLots(): Promise<LotReportItem[]> {
    return this.lotsValue;
  }
}

// ── Fake CashClosingRepository ────────────────────────────────

class FakeCashClosingRepository implements CashClosingRepository {
  closings: CashClosing[] = [];

  async save(closing: CashClosing): Promise<void> {
    this.closings.push(closing);
  }

  async findLast(): Promise<CashClosing | null> {
    return this.closings.length > 0 ? this.closings[this.closings.length - 1]! : null;
  }
}

// ── Helpers ───────────────────────────────────────────────────

function makeStockItem(overrides: Partial<StockByProductItem> = {}): StockByProductItem {
  return {
    productId: 'prod-1',
    productName: 'Product A',
    variantId: 'var-1',
    variantName: 'Variant A',
    sku: 'SKU-A',
    totalRemainingQty: 10,
    investmentCents: 50000,
    ...overrides,
  };
}

function makeLotItem(overrides: Partial<LotReportItem> = {}): LotReportItem {
  return {
    lotId: 'lot-1',
    variantId: 'var-1',
    purchaseDate: new Date('2026-01-01'),
    purchasedQuantity: 100,
    remainingQuantity: 30,
    unitCostCents: 500,
    totalCostCents: 15000,
    status: 'OPEN',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('GetLiquidityUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetLiquidityUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetLiquidityUseCase(repo);
  });

  it('returns liquidity from cash ledger only', async () => {
    repo.liquidityCentsValue = 250000;
    const result = await useCase.execute();
    expect(result.liquidityCents).toBe(250000);
  });

  it('returns zero liquidity when no entries exist', async () => {
    repo.liquidityCentsValue = 0;
    const result = await useCase.execute();
    expect(result.liquidityCents).toBe(0);
  });

  it('returns negative liquidity when overdrawn', async () => {
    repo.liquidityCentsValue = -50000;
    const result = await useCase.execute();
    expect(result.liquidityCents).toBe(-50000);
  });

  it('liquidity does NOT include stock investment value', async () => {
    // Even though stock investment is $100000, liquidity should be separate
    repo.liquidityCentsValue = 50000;
    repo.stockInvestmentCentsValue = 100000;

    const result = await useCase.execute();
    expect(result.liquidityCents).toBe(50000);
    expect(result.liquidityCents).not.toBe(150000); // Not the sum
  });
});

describe('GetStockInvestmentUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetStockInvestmentUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetStockInvestmentUseCase(repo);
  });

  it('returns stock investment from remaining FIFO lots', async () => {
    repo.stockInvestmentCentsValue = 350000;
    const result = await useCase.execute();
    expect(result.stockInvestmentCents).toBe(350000);
  });

  it('returns zero when no stock exists', async () => {
    repo.stockInvestmentCentsValue = 0;
    const result = await useCase.execute();
    expect(result.stockInvestmentCents).toBe(0);
  });
});

describe('GetSalesTotalUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetSalesTotalUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetSalesTotalUseCase(repo);
  });

  it('returns sales income from active sales only', async () => {
    repo.salesIncomeCentsValue = 500000;
    const result = await useCase.execute();
    expect(result.salesIncomeCents).toBe(500000);
  });

  it('returns zero when no active sales exist', async () => {
    repo.salesIncomeCentsValue = 0;
    const result = await useCase.execute();
    expect(result.salesIncomeCents).toBe(0);
  });

  it('excludes cancelled and returned sales from total', async () => {
    // The repo query already only sums ACTIVE sales
    repo.salesIncomeCentsValue = 300000;
    const result = await useCase.execute();
    expect(result.salesIncomeCents).toBe(300000);
  });
});

describe('GetFifoCostsUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetFifoCostsUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetFifoCostsUseCase(repo);
  });

  it('returns FIFO COGS from active sale consumptions', async () => {
    repo.fifoCostsCentsValue = 180000;
    const result = await useCase.execute();
    expect(result.fifoCostsCents).toBe(180000);
  });

  it('returns zero when no active sales have consumed stock', async () => {
    repo.fifoCostsCentsValue = 0;
    const result = await useCase.execute();
    expect(result.fifoCostsCents).toBe(0);
  });
});

describe('GetGrossProfitUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetGrossProfitUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetGrossProfitUseCase(repo);
  });

  it('calculates gross profit as sales income minus FIFO COGS', async () => {
    repo.salesIncomeCentsValue = 500000;
    repo.fifoCostsCentsValue = 180000;
    const result = await useCase.execute();
    expect(result.salesIncomeCents).toBe(500000);
    expect(result.fifoCostsCents).toBe(180000);
    expect(result.grossProfitCents).toBe(320000);
  });

  it('returns negative profit when COGS exceeds income', async () => {
    repo.salesIncomeCentsValue = 100000;
    repo.fifoCostsCentsValue = 150000;
    const result = await useCase.execute();
    expect(result.grossProfitCents).toBe(-50000);
  });

  it('returns zero when no sales or COGS exist', async () => {
    repo.salesIncomeCentsValue = 0;
    repo.fifoCostsCentsValue = 0;
    const result = await useCase.execute();
    expect(result.grossProfitCents).toBe(0);
  });
});

describe('GetReinvestmentUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetReinvestmentUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetReinvestmentUseCase(repo);
  });

  it('returns reinvestment as sum of purchase cash outflows', async () => {
    repo.reinvestmentCentsValue = 250000;
    const result = await useCase.execute();
    expect(result.reinvestmentCents).toBe(250000);
  });

  it('returns zero when no purchases have been made', async () => {
    repo.reinvestmentCentsValue = 0;
    const result = await useCase.execute();
    expect(result.reinvestmentCents).toBe(0);
  });
});

describe('GetOperatingCapitalUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetOperatingCapitalUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetOperatingCapitalUseCase(repo);
  });

  it('calculates operating capital as liquidity plus stock investment', async () => {
    repo.liquidityCentsValue = 200000;
    repo.stockInvestmentCentsValue = 350000;
    const result = await useCase.execute();
    expect(result.liquidityCents).toBe(200000);
    expect(result.stockInvestmentCents).toBe(350000);
    expect(result.operatingCapitalCents).toBe(550000);
  });

  it('returns liquidity when stock is zero', async () => {
    repo.liquidityCentsValue = 150000;
    repo.stockInvestmentCentsValue = 0;
    const result = await useCase.execute();
    expect(result.operatingCapitalCents).toBe(150000);
  });

  it('handles negative liquidity (overdrawn) correctly', async () => {
    repo.liquidityCentsValue = -50000;
    repo.stockInvestmentCentsValue = 200000;
    const result = await useCase.execute();
    expect(result.operatingCapitalCents).toBe(150000);
  });
});

describe('GetStockByProductUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetStockByProductUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetStockByProductUseCase(repo);
  });

  it('returns stock grouped by product with totals', async () => {
    repo.stockByProductValue = [
      makeStockItem({ productName: 'Product A', investmentCents: 50000 }),
      makeStockItem({ productName: 'Product B', productId: 'prod-2', variantId: 'var-2', sku: 'SKU-B', investmentCents: 30000 }),
    ];

    const result = await useCase.execute();
    expect(result.items).toHaveLength(2);
    expect(result.totalInvestmentCents).toBe(80000);
  });

  it('returns empty list when no stock exists', async () => {
    repo.stockByProductValue = [];
    const result = await useCase.execute();
    expect(result.items).toHaveLength(0);
    expect(result.totalInvestmentCents).toBe(0);
  });
});

describe('GetLotsUseCase', () => {
  let repo: FakeReportReadRepository;
  let useCase: GetLotsUseCase;

  beforeEach(() => {
    repo = new FakeReportReadRepository();
    useCase = new GetLotsUseCase(repo);
  });

  it('separates open and exhausted lots', async () => {
    repo.lotsValue = [
      makeLotItem({ lotId: 'lot-1', remainingQuantity: 30, status: 'OPEN' }),
      makeLotItem({ lotId: 'lot-2', remainingQuantity: 0, status: 'EXHAUSTED' }),
      makeLotItem({ lotId: 'lot-3', remainingQuantity: 10, status: 'OPEN' }),
    ];

    const result = await useCase.execute();
    expect(result.open).toHaveLength(2);
    expect(result.exhausted).toHaveLength(1);
    expect(result.totalOpenCount).toBe(2);
    expect(result.totalExhaustedCount).toBe(1);
  });

  it('returns empty lists when no lots exist', async () => {
    repo.lotsValue = [];
    const result = await useCase.execute();
    expect(result.open).toHaveLength(0);
    expect(result.exhausted).toHaveLength(0);
  });
});

describe('ManualCashCloseUseCase', () => {
  let reportRepo: FakeReportReadRepository;
  let closingRepo: FakeCashClosingRepository;
  let useCase: ManualCashCloseUseCase;

  beforeEach(() => {
    reportRepo = new FakeReportReadRepository();
    closingRepo = new FakeCashClosingRepository();
    useCase = new ManualCashCloseUseCase(reportRepo, closingRepo);
  });

  it('creates a cash closing with current liquidity snapshot', async () => {
    reportRepo.liquidityCentsValue = 500000;

    const result = await useCase.execute({ notes: 'Monthly close' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.liquidityCents).toBe(500000);
    expect(result.value.closingId).toBeDefined();
    expect(result.value.closedAt).toBeDefined();
  });

  it('persists the closing record', async () => {
    reportRepo.liquidityCentsValue = 250000;

    await useCase.execute({ notes: null });

    expect(closingRepo.closings).toHaveLength(1);
    expect(closingRepo.closings[0]!.liquidityCents).toBe(250000);
  });

  it('allows closing without notes', async () => {
    reportRepo.liquidityCentsValue = 100000;

    const result = await useCase.execute({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.liquidityCents).toBe(100000);
  });

  it('captures the exact liquidity at time of closing', async () => {
    reportRepo.liquidityCentsValue = -30000; // overdrawn

    const result = await useCase.execute({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.liquidityCents).toBe(-30000);
  });
});
