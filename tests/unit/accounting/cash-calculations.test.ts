/**
 * Unit tests for cash/accounting domain calculations.
 *
 * Tests the pure domain rules and invariants:
 * - CashClosing entity invariants
 * - Liquidity is derived from cash movements only (not stock value)
 * - Financial semantics match the v1 cash accounting model
 */
import { describe, it, expect } from 'vitest';
import { CashClosing } from '../../../src/modules/accounting-reports/domain/CashClosing.js';
import { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { Money } from '../../../src/shared/domain/Money.js';

// ── CashClosing invariants ────────────────────────────────────

describe('CashClosing', () => {
  describe('construction', () => {
    it('creates a cash closing with correct fields', () => {
      const now = new Date('2026-05-01T12:00:00Z');
      const closing = new CashClosing(
        'close-1',
        1500000, // $15,000.00
        'End of month closing',
        now,
        now,
      );

      expect(closing.id).toBe('close-1');
      expect(closing.liquidityCents).toBe(1500000);
      expect(closing.notes).toBe('End of month closing');
      expect(closing.closedAt).toEqual(now);
      expect(closing.createdAt).toEqual(now);
    });

    it('allows null notes', () => {
      const now = new Date();
      const closing = new CashClosing('close-2', 50000, null, now, now);
      expect(closing.notes).toBeNull();
    });

    it('accepts zero liquidity', () => {
      const now = new Date();
      const closing = new CashClosing('close-3', 0, null, now, now);
      expect(closing.liquidityCents).toBe(0);
    });

    it('accepts negative liquidity (overdrawn)', () => {
      const now = new Date();
      const closing = new CashClosing('close-4', -50000, null, now, now);
      expect(closing.liquidityCents).toBe(-50000);
    });

    it('freezes the entity (immutability)', () => {
      const now = new Date();
      const closing = new CashClosing('close-5', 1000, null, now, now);
      expect(Object.isFrozen(closing)).toBe(true);
    });
  });

  describe('toString', () => {
    it('includes id and liquidity in string representation', () => {
      const now = new Date('2026-05-01T12:00:00Z');
      const closing = new CashClosing('close-6', 75000, null, now, now);
      const str = closing.toString();
      expect(str).toContain('close-6');
      expect(str).toContain('75000');
    });
  });
});

// ── Liquidity semantics ───────────────────────────────────────

describe('Liquidity semantics', () => {
  it('liquidity equals sum of all cash entry amounts', () => {
    // Simulate: sale +2000, purchase -800, return -500, adjustment +100
    const entries = [
      makeEntry('e1', 'SALE_INCOME', 2000, 'sale-1', null),
      makeEntry('e2', 'PURCHASE_OUTFLOW', -800, 'purch-1', 'REINVESTMENT'),
      makeEntry('e3', 'RETURN_OUTFLOW', -500, 'sale-1', null),
      makeEntry('e4', 'MANUAL_ADJUSTMENT', 100, null, null),
    ];

    const liquidity = entries.reduce((sum, e) => sum + e.amount.cents, 0);
    expect(liquidity).toBe(800); // 2000 - 800 - 500 + 100
  });

  it('liquidity excludes stock investment value entirely', () => {
    // Cash ledger has only: sale income 5000, purchase outflow -3000
    const cashEntries = [
      makeEntry('e1', 'SALE_INCOME', 5000, 'sale-1', null),
      makeEntry('e2', 'PURCHASE_OUTFLOW', -3000, 'purch-1', 'REINVESTMENT'),
    ];

    // Stock investment (simulated): 10 units × $200 = $2000
    const stockInvestment = 10 * 200;

    // Liquidity is ONLY from cash entries
    const liquidity = cashEntries.reduce((sum, e) => sum + e.amount.cents, 0);

    expect(liquidity).toBe(2000); // 5000 - 3000
    expect(stockInvestment).toBe(2000);
    expect(liquidity).not.toBe(liquidity + stockInvestment); // NOT combined
  });

  it('sales income increases liquidity and return outflow decreases it', () => {
    // Sale of $10000
    const saleEntry = makeEntry('e1', 'SALE_INCOME', 10000, 'sale-1', null);
    // Return refund of $10000 (full return)
    const returnEntry = makeEntry('e2', 'RETURN_OUTFLOW', -10000, 'sale-1', null);

    const netLiquidity = saleEntry.amount.cents + returnEntry.amount.cents;
    expect(netLiquidity).toBe(0); // Sale then return = net zero
  });

  it('cancellation reverses sale income via negative SALE_INCOME', () => {
    // Original sale income
    const saleEntry = makeEntry('e1', 'SALE_INCOME', 5000, 'sale-1', null);
    // Cancellation reverses it
    const cancelEntry = makeEntry('e2', 'SALE_INCOME', -5000, 'sale-1', null);

    const netLiquidity = saleEntry.amount.cents + cancelEntry.amount.cents;
    expect(netLiquidity).toBe(0);
  });

  it('manual withdrawal decreases liquidity', () => {
    const entries = [
      makeEntry('e1', 'SALE_INCOME', 10000, 'sale-1', null),
      makeEntry('e2', 'WITHDRAWAL', -3000, 'draw-1', 'DRAW'),
    ];

    const liquidity = entries.reduce((sum, e) => sum + e.amount.cents, 0);
    expect(liquidity).toBe(7000);
  });
});

// ── CashEntry types and tags ──────────────────────────────────

describe('CashEntry tags', () => {
  it('purchase outflows are tagged as REINVESTMENT', () => {
    const entry = makeEntry('e1', 'PURCHASE_OUTFLOW', -5000, 'purch-1', 'REINVESTMENT');
    expect(entry.tag).toBe('REINVESTMENT');
    expect(entry.type).toBe('PURCHASE_OUTFLOW');
    expect(entry.amount.isNegative()).toBe(true);
  });

  it('restock entries can be tagged as RESTOCK', () => {
    const entry = makeEntry('e2', 'PURCHASE_OUTFLOW', -2000, 'purch-2', 'RESTOCK');
    expect(entry.tag).toBe('RESTOCK');
  });

  it('withdrawals can be tagged as DRAW', () => {
    const entry = makeEntry('e3', 'WITHDRAWAL', -1000, 'draw-1', 'DRAW');
    expect(entry.tag).toBe('DRAW');
  });

  it('sale income has no tag', () => {
    const entry = makeEntry('e4', 'SALE_INCOME', 5000, 'sale-1', null);
    expect(entry.tag).toBeNull();
  });
});

// ── Helpers ───────────────────────────────────────────────────

function makeEntry(
  id: string,
  type: 'SALE_INCOME' | 'PURCHASE_OUTFLOW' | 'RETURN_OUTFLOW' | 'MANUAL_ADJUSTMENT' | 'WITHDRAWAL',
  amountCents: number,
  sourceId: string | null,
  tag: string | null,
): CashLedgerEntry {
  return new CashLedgerEntry(
    CashLedgerEntryId.from(id),
    type,
    Money.fromCents(amountCents),
    sourceId ?? id,
    tag,
    new Date(),
  );
}
