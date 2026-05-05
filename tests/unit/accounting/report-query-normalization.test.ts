/**
 * Unit tests for the monetary aggregate normalization helper.
 *
 * Verifies that raw DB outputs (number, string, null) are always
 * coerced to integer cents before entering domain/application.
 */
import { describe, it, expect } from 'vitest';
import { normalizeCents } from '../../../src/modules/accounting-reports/infrastructure/typeorm/ReportQueryAdapter.js';

describe('normalizeCents', () => {
  // ── Null/undefined → zero ────────────────────────────

  it('returns 0 for null', () => {
    expect(normalizeCents(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(normalizeCents(undefined)).toBe(0);
  });

  // ── Integer preservation ─────────────────────────────

  it('preserves positive integer cents', () => {
    expect(normalizeCents(250000)).toBe(250000);
  });

  it('preserves negative integer cents', () => {
    expect(normalizeCents(-50000)).toBe(-50000);
  });

  it('preserves zero', () => {
    expect(normalizeCents(0)).toBe(0);
  });

  // ── String coercion ──────────────────────────────────

  it('parses a numeric string into cents', () => {
    expect(normalizeCents('100')).toBe(100);
  });

  it('parses negative numeric string', () => {
    expect(normalizeCents('-3000')).toBe(-3000);
  });

  // ── Float → integer rounding ─────────────────────────

  it('rounds positive float to nearest cent', () => {
    expect(normalizeCents(100.7)).toBe(101);
  });

  it('rounds negative float away from zero', () => {
    expect(normalizeCents(-100.7)).toBe(-101);
  });

  it('rounds down when fraction < 0.5', () => {
    expect(normalizeCents(200.3)).toBe(200);
    expect(normalizeCents(-200.3)).toBe(-200);
  });

  it('rounds string float to integer', () => {
    expect(normalizeCents('150.6')).toBe(151);
  });

  // ── unknown context (Record<string, unknown> usage) ─────────

  it('handles value from Record<string, unknown> context', () => {
    const row: Record<string, unknown> = { investment_cents: '50000' };
    const result = normalizeCents(row.investment_cents);
    expect(result).toBe(50000);
  });

  it('handles null from Record<string, unknown> context', () => {
    const row: Record<string, unknown> = { investment_cents: null };
    const result = normalizeCents(row.investment_cents);
    expect(result).toBe(0);
  });

  it('handles number from Record<string, unknown> context', () => {
    const row: Record<string, unknown> = { investment_cents: 12345 };
    const result = normalizeCents(row.investment_cents);
    expect(result).toBe(12345);
  });
});
