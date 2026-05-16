/**
 * Unit tests for CashBox domain aggregate.
 *
 * Tests invariants:
 * - CashBoxId typed identifier
 * - CashBox creation in OPEN state with business date and balances
 * - Close transition: OPEN → CLOSED with final balance
 * - Invariant enforcement: status transitions, balance types, required fields
 * - Immutability: all domain entities are frozen
 */
import { describe, it, expect } from 'vitest';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { CashBox, CASH_BOX_STATUSES } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import type { CashBoxStatus } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { BusinessRuleError } from '../../../src/shared/domain/errors.js';

// ── CashBoxId ────────────────────────────────────────────────

describe('CashBoxId', () => {
  it('creates from a valid UUID string', () => {
    const id = CashBoxId.from('550e8400-e29b-41d4-a716-446655440000');
    expect(id.value).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('generates a random UUID', () => {
    const id = CashBoxId.generate();
    expect(id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('compares equal for same value', () => {
    const a = CashBoxId.from('abc-123');
    const b = CashBoxId.from('abc-123');
    expect(a.equals(b)).toBe(true);
  });

  it('compares not equal for different values', () => {
    const a = CashBoxId.from('abc-123');
    const b = CashBoxId.from('xyz-789');
    expect(a.equals(b)).toBe(false);
  });

  it('serializes to string via toString', () => {
    const id = CashBoxId.from('my-id');
    expect(id.toString()).toBe('my-id');
  });
});

// ── CashBox status constants ─────────────────────────────────

describe('CashBox status constants', () => {
  it('defines OPEN and CLOSED statuses', () => {
    expect(CASH_BOX_STATUSES).toContain('OPEN');
    expect(CASH_BOX_STATUSES).toContain('CLOSED');
    expect(CASH_BOX_STATUSES).toHaveLength(2);
  });
});

// ── CashBox creation (OPEN state) ────────────────────────────

describe('CashBox creation', () => {
  it('creates an OPEN cash box with given fields', () => {
    const id = CashBoxId.from('box-1');
    const now = new Date('2026-05-15T12:00:00Z');
    const box = new CashBox({
      id,
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: 0,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: now,
    });

    expect(box.id).toBe(id);
    expect(box.businessDate).toBe('2026-05-15');
    expect(box.status).toBe('OPEN');
    expect(box.openingBalanceCents).toBe(0);
    expect(box.currentBalanceCents).toBe(0);
    expect(box.finalBalanceCents).toBeNull();
    expect(box.closedAt).toBeNull();
    expect(box.legacy).toBe(false);
    expect(box.createdAt).toEqual(now);
  });

  it('is frozen (immutable)', () => {
    const box = new CashBox({
      id: CashBoxId.generate(),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: 0,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });

    expect(Object.isFrozen(box)).toBe(true);
  });

  it('rejects empty business date', () => {
    expect(
      () =>
        new CashBox({
          id: CashBoxId.generate(),
          businessDate: '',
          status: 'OPEN',
          openingBalanceCents: 0,
          currentBalanceCents: 0,
          finalBalanceCents: null,
          closedAt: null,
          legacy: false,
          createdAt: new Date(),
        }),
    ).toThrow(BusinessRuleError);
  });

  it('rejects non-integer opening balance', () => {
    expect(
      () =>
        new CashBox({
          id: CashBoxId.generate(),
          businessDate: '2026-05-15',
          status: 'OPEN',
          openingBalanceCents: 1.5,
          currentBalanceCents: 0,
          finalBalanceCents: null,
          closedAt: null,
          legacy: false,
          createdAt: new Date(),
        }),
    ).toThrow(BusinessRuleError);
  });

  it('rejects non-integer current balance', () => {
    expect(
      () =>
        new CashBox({
          id: CashBoxId.generate(),
          businessDate: '2026-05-15',
          status: 'OPEN',
          openingBalanceCents: 0,
          currentBalanceCents: 1.5,
          finalBalanceCents: null,
          closedAt: null,
          legacy: false,
          createdAt: new Date(),
        }),
    ).toThrow(BusinessRuleError);
  });

  it('rejects CLOSED status without final balance', () => {
    expect(
      () =>
        new CashBox({
          id: CashBoxId.generate(),
          businessDate: '2026-05-15',
          status: 'CLOSED',
          openingBalanceCents: 1000,
          currentBalanceCents: 2000,
          finalBalanceCents: null,
          closedAt: new Date(),
          legacy: false,
          createdAt: new Date(),
        }),
    ).toThrow(BusinessRuleError);
  });

  it('rejects CLOSED status without closedAt', () => {
    expect(
      () =>
        new CashBox({
          id: CashBoxId.generate(),
          businessDate: '2026-05-15',
          status: 'CLOSED',
          openingBalanceCents: 1000,
          currentBalanceCents: 2000,
          finalBalanceCents: 2000,
          closedAt: null,
          legacy: false,
          createdAt: new Date(),
        }),
    ).toThrow(BusinessRuleError);
  });

  it('rejects OPEN status with closedAt set', () => {
    expect(
      () =>
        new CashBox({
          id: CashBoxId.generate(),
          businessDate: '2026-05-15',
          status: 'OPEN',
          openingBalanceCents: 0,
          currentBalanceCents: 0,
          finalBalanceCents: null,
          closedAt: new Date(),
          legacy: false,
          createdAt: new Date(),
        }),
    ).toThrow(BusinessRuleError);
  });

  it('accepts CLOSED with all required fields', () => {
    const now = new Date();
    const box = new CashBox({
      id: CashBoxId.from('box-closed'),
      businessDate: '2026-05-14',
      status: 'CLOSED',
      openingBalanceCents: 1000,
      currentBalanceCents: 2500,
      finalBalanceCents: 2500,
      closedAt: now,
      legacy: false,
      createdAt: now,
    });

    expect(box.status).toBe('CLOSED');
    expect(box.finalBalanceCents).toBe(2500);
    expect(box.closedAt).toEqual(now);
  });

  it('rejects invalid status string', () => {
    expect(
      () =>
        new CashBox({
          id: CashBoxId.generate(),
          businessDate: '2026-05-15',
          status: 'INVALID' as CashBoxStatus,
          openingBalanceCents: 0,
          currentBalanceCents: 0,
          finalBalanceCents: null,
          closedAt: null,
          legacy: false,
          createdAt: new Date(),
        }),
    ).toThrow(BusinessRuleError);
  });
});

// ── CashBox close method ─────────────────────────────────────

describe('CashBox.close()', () => {
  it('transitions OPEN to CLOSED with final balance', () => {
    const box = new CashBox({
      id: CashBoxId.generate(),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: 5000,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });

    const closed = box.close(5000);

    expect(closed.status).toBe('CLOSED');
    expect(closed.finalBalanceCents).toBe(5000);
    expect(closed.closedAt).toBeInstanceOf(Date);
    // Original remains unchanged (immutability)
    expect(box.status).toBe('OPEN');
  });

  it('throws if already closed', () => {
    const now = new Date();
    const box = new CashBox({
      id: CashBoxId.generate(),
      businessDate: '2026-05-14',
      status: 'CLOSED',
      openingBalanceCents: 1000,
      currentBalanceCents: 1000,
      finalBalanceCents: 1000,
      closedAt: now,
      legacy: false,
      createdAt: now,
    });

    expect(() => box.close(1000)).toThrow(BusinessRuleError);
  });

  it('throws if final balance is not an integer', () => {
    const box = new CashBox({
      id: CashBoxId.generate(),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: 0,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });

    expect(() => box.close(1.5)).toThrow(BusinessRuleError);
  });

  it('preserves identity and business date across close', () => {
    const id = CashBoxId.from('persistent-box');
    const box = new CashBox({
      id,
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 2000,
      currentBalanceCents: 5000,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });

    const closed = box.close(5000);

    expect(closed.id.equals(id)).toBe(true);
    expect(closed.businessDate).toBe('2026-05-15');
    expect(closed.openingBalanceCents).toBe(2000);
  });

  it('allows different final balance than current balance (reconciliation)', () => {
    const box = new CashBox({
      id: CashBoxId.generate(),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: 5000,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });

    // Closing balance can differ from current if reconciling
    const closed = box.close(4800);
    expect(closed.finalBalanceCents).toBe(4800);
  });
});

// ── CashBox isOpen / isClosed helpers ────────────────────────

describe('CashBox status predicates', () => {
  it('isOpen returns true for OPEN', () => {
    const box = new CashBox({
      id: CashBoxId.generate(),
      businessDate: '2026-05-15',
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: 0,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });

    expect(box.isOpen()).toBe(true);
    expect(box.isClosed()).toBe(false);
  });

  it('isClosed returns true for CLOSED', () => {
    const now = new Date();
    const box = new CashBox({
      id: CashBoxId.generate(),
      businessDate: '2026-05-14',
      status: 'CLOSED',
      openingBalanceCents: 1000,
      currentBalanceCents: 1000,
      finalBalanceCents: 1000,
      closedAt: now,
      legacy: false,
      createdAt: now,
    });

    expect(box.isClosed()).toBe(true);
    expect(box.isOpen()).toBe(false);
  });
});
