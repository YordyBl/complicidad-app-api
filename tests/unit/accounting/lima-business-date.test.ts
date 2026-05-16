/**
 * Unit tests for toLimaBusinessDate helper.
 *
 * Verifies:
 * - Conversion from UTC Date to America/Lima YYYY-MM-DD
 * - Correct handling of date boundary (UTC day vs Lima day)
 * - Lima is UTC-5 (no DST), so 05:00 UTC = 00:00 Lima
 */
import { describe, it, expect } from 'vitest';
import { toLimaBusinessDate } from '../../../src/modules/accounting-reports/domain/LimaBusinessDate.js';

describe('toLimaBusinessDate', () => {
  it('converts UTC noon to same day in Lima (UTC-5)', () => {
    // 2026-05-15T12:00:00Z = 2026-05-15T07:00:00 Lima (UTC-5)
    const date = new Date('2026-05-15T12:00:00Z');
    expect(toLimaBusinessDate(date)).toBe('2026-05-15');
  });

  it('returns previous Lima day when UTC time is before 05:00', () => {
    // 2026-05-15T04:59:59Z = 2026-05-14T23:59:59 Lima
    const date = new Date('2026-05-15T04:59:59Z');
    expect(toLimaBusinessDate(date)).toBe('2026-05-14');
  });

  it('returns current Lima day when UTC time is at 05:00', () => {
    // 2026-05-15T05:00:00Z = 2026-05-15T00:00:00 Lima
    const date = new Date('2026-05-15T05:00:00Z');
    expect(toLimaBusinessDate(date)).toBe('2026-05-15');
  });

  it('handles year boundary across UTC/Lima offset', () => {
    // 2025-12-31T23:00:00Z = 2025-12-31T18:00:00 Lima (still same day)
    const date = new Date('2025-12-31T23:00:00Z');
    expect(toLimaBusinessDate(date)).toBe('2025-12-31');
  });

  it('handles early UTC hour crossing into previous year Lima day', () => {
    // 2026-01-01T03:00:00Z = 2025-12-31T22:00:00 Lima
    const date = new Date('2026-01-01T03:00:00Z');
    expect(toLimaBusinessDate(date)).toBe('2025-12-31');
  });

  it('handles late Lima day (23:00 Lima = next day 04:00 UTC)', () => {
    // Create a date that is 2026-05-15T23:00:00 Lima
    // In UTC that's 2026-05-16T04:00:00Z
    const date = new Date('2026-05-16T04:00:00Z');
    expect(toLimaBusinessDate(date)).toBe('2026-05-15');
  });

  it('returns consistent string format YYYY-MM-DD', () => {
    const date = new Date('2026-05-01T12:00:00Z');
    const result = toLimaBusinessDate(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns today for current system time', () => {
    const result = toLimaBusinessDate(new Date());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
