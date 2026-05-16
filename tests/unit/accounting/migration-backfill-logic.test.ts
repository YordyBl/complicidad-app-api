/**
 * Unit tests for the migration backfill logic.
 *
 * This file validates the CORRECT timezone conversion and balance computation
 * logic that the migration SQL must implement. The migration groups legacy
 * `cash_ledger_entries` rows by America/Lima business date and computes
 * running balances to create CLOSED legacy cash boxes.
 *
 * The critical bug it guards against: using `(created_at AT TIME ZONE 'UTC'
 * AT TIME ZONE 'America/Lima')::date` which produces the WRONG Lima date for
 * UTC timestamps near the 05:00 UTC (= 00:00 Lima) boundary.
 *
 * The CORRECT SQL expression is: `(created_at AT TIME ZONE 'America/Lima')::date`
 * which directly converts a timestamptz to the local Lima date.
 *
 * These tests are the JS-equivalent of the correct SQL logic, ensuring the
 * mathematical conversion is right regardless of SQL dialect.
 */
import { describe, it, expect } from 'vitest';
import { toLimaBusinessDate } from '../../../src/modules/accounting-reports/domain/LimaBusinessDate.js';

// ── Helpers matching migration SQL semantics ───────────────────────────

/**
 * JS equivalent of SQL: (created_at AT TIME ZONE 'America/Lima')::date
 *
 * For a timestamptz, SQL's `AT TIME ZONE 'America/Lima'` converts to local
 * Lima time as a bare timestamp (no tz), then `::date` extracts the date.
 *
 * JS's Intl.DateTimeFormat with timeZone: 'America/Lima' does the same:
 * it formats the UTC Date as a YYYY-MM-DD string in Lima timezone.
 */
function toLimaDate(utcDate: Date): string {
  return toLimaBusinessDate(utcDate);
}

/**
 * JS equivalent of SQL closed_at computation:
 *   (lima_date + time '23:59:59') AT TIME ZONE 'America/Lima'
 *
 * This computes the UTC equivalent of "end of day in Lima":
 *   23:59:59 on business_date in America/Lima timezone.
 */
function toClosedAtUtc(businessDate: string): Date {
  return new Date(`${businessDate}T23:59:59-05:00`);
}

/**
 * Compute running balances per date — equivalent to the migration's
 * CTE logic (date_balances → running_balances → legacy_boxes).
 *
 * @param entries - Array of { date: YYYY-MM-DD, amountCents: number }
 * @returns Array of { limaDate, openingCents, dayTotalCents, finalCents }
 */
function computeLegacyBalances(
  entries: { date: string; amountCents: number }[],
): {
  limaDate: string;
  openingCents: number;
  dayTotalCents: number;
  finalCents: number;
}[] {
  // Group by date and sum amounts (like SQL GROUP BY)
  const grouped = new Map<string, number>();
  for (const entry of entries) {
    grouped.set(entry.date, (grouped.get(entry.date) ?? 0) + entry.amountCents);
  }

  // Sort dates chronologically (like SQL ORDER BY lima_date)
  const sortedDates = [...grouped.keys()].sort();

  // Compute running balances (like SQL SUM() OVER ... ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
  let runningTotal = 0;
  const result: {
    limaDate: string;
    openingCents: number;
    dayTotalCents: number;
    finalCents: number;
  }[] = [];

  for (const limaDate of sortedDates) {
    const dayTotalCents = grouped.get(limaDate)!;
    const openingCents = runningTotal;
    const finalCents = openingCents + dayTotalCents;
    result.push({ limaDate, openingCents, dayTotalCents, finalCents });
    runningTotal = finalCents; // next day's opening = this day's final
  }

  return result;
}

// ── Tests: Timezone conversion ─────────────────────────────────────────

describe('Migration backfill: Lima date conversion', () => {
  it('converts UTC noon to same day in Lima (UTC-5)', () => {
    // 2026-05-15T12:00:00Z = 2026-05-15T07:00:00 Lima
    const date = new Date('2026-05-15T12:00:00Z');
    expect(toLimaDate(date)).toBe('2026-05-15');
  });

  it('returns PREVIOUS Lima day when UTC time is before 05:00 (the critical bug boundary)', () => {
    // 2026-05-15T04:59:59Z = 2026-05-14T23:59:59 Lima → date is 05-14
    // The buggy SQL (AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima') would
    // produce 2026-05-15 — WRONG. The correct SQL produces 2026-05-14.
    const date = new Date('2026-05-15T04:59:59Z');
    expect(toLimaDate(date)).toBe('2026-05-14');
  });

  it('returns current Lima day when UTC time is exactly 05:00', () => {
    // 2026-05-15T05:00:00Z = 2026-05-15T00:00:00 Lima → date is 05-15
    const date = new Date('2026-05-15T05:00:00Z');
    expect(toLimaDate(date)).toBe('2026-05-15');
  });

  it('handles multiple entries on the same Lima day from different UTC hours', () => {
    // Both of these UTC timestamps map to 2026-05-15 in Lima:
    //   2026-05-15T05:00:00Z = 00:00 Lima
    //   2026-05-15T12:00:00Z = 07:00 Lima
    //   2026-05-16T04:59:59Z = 23:59 Lima on 05-15
    const date1 = new Date('2026-05-15T05:00:00Z');
    const date2 = new Date('2026-05-15T12:00:00Z');
    const date3 = new Date('2026-05-16T04:59:59Z');
    expect(toLimaDate(date1)).toBe('2026-05-15');
    expect(toLimaDate(date2)).toBe('2026-05-15');
    expect(toLimaDate(date3)).toBe('2026-05-15');
  });

  it('handles year boundary across UTC/Lima offset', () => {
    // 2025-12-31T23:00:00Z = 2025-12-31T18:00:00 Lima (same day)
    const date = new Date('2025-12-31T23:00:00Z');
    expect(toLimaDate(date)).toBe('2025-12-31');
  });

  it('handles early UTC hour crossing into PREVIOUS YEAR Lima day', () => {
    // 2026-01-01T03:00:00Z = 2025-12-31T22:00:00 Lima
    const date = new Date('2026-01-01T03:00:00Z');
    expect(toLimaDate(date)).toBe('2025-12-31');
  });

  it('handles late Lima day (23:00 Lima = next day 04:00 UTC)', () => {
    // 2026-05-15T23:00:00 Lima = 2026-05-16T04:00:00Z
    const date = new Date('2026-05-16T04:00:00Z');
    expect(toLimaDate(date)).toBe('2026-05-15');
  });

  it('produces consistent grouping for all entries on the same Lima day', () => {
    // This simulates what the migration's GROUP BY does:
    // all these UTC timestamps share one Lima date
    const timestamps = [
      '2026-05-15T05:00:00Z',
      '2026-05-15T10:00:00Z',
      '2026-05-15T15:00:00Z',
      '2026-05-15T23:59:59Z',
      '2026-05-16T04:00:00Z',
      '2026-05-16T04:59:59Z',
    ];
    for (const ts of timestamps) {
      expect(toLimaDate(new Date(ts))).toBe('2026-05-15');
    }
  });
});

// ── Tests: closed_at computation ──────────────────────────────────────

describe('Migration backfill: closed_at timestamp', () => {
  it('produces correct UTC equivalent for 23:59:59 Lima on business date', () => {
    // 2026-05-15 23:59:59 Lima = 2026-05-16 04:59:59 UTC
    const closedAt = toClosedAtUtc('2026-05-15');
    expect(closedAt.toISOString()).toBe('2026-05-16T04:59:59.000Z');
  });

  it('handles year boundary', () => {
    // 2025-12-31 23:59:59 Lima = 2026-01-01 04:59:59 UTC
    const closedAt = toClosedAtUtc('2025-12-31');
    expect(closedAt.toISOString()).toBe('2026-01-01T04:59:59.000Z');
  });

  it('handles month boundary', () => {
    // 2026-01-31 23:59:59 Lima = 2026-02-01 04:59:59 UTC
    const closedAt = toClosedAtUtc('2026-01-31');
    expect(closedAt.toISOString()).toBe('2026-02-01T04:59:59.000Z');
  });
});

// ── Tests: Running balance computation ─────────────────────────────────

describe('Migration backfill: running balance computation', () => {
  it('creates correct balances for a single day', () => {
    const entries = [{ date: '2026-05-15', amountCents: 1000 }];
    const result = computeLegacyBalances(entries);

    expect(result).toHaveLength(1);
    expect(result[0]!.limaDate).toBe('2026-05-15');
    expect(result[0]!.openingCents).toBe(0);
    expect(result[0]!.dayTotalCents).toBe(1000);
    expect(result[0]!.finalCents).toBe(1000);
  });

  it('correctly computes running balance across multiple days', () => {
    const entries = [
      { date: '2026-05-13', amountCents: 5000 },  // day 1: +5000
      { date: '2026-05-14', amountCents: -2000 },  // day 2: -2000
      { date: '2026-05-15', amountCents: 3000 },   // day 3: +3000
    ];
    const result = computeLegacyBalances(entries);

    expect(result).toHaveLength(3);

    // Day 1: opening 0, total +5000, final 5000
    expect(result[0]!.limaDate).toBe('2026-05-13');
    expect(result[0]!.openingCents).toBe(0);
    expect(result[0]!.dayTotalCents).toBe(5000);
    expect(result[0]!.finalCents).toBe(5000);

    // Day 2: opening 5000, total -2000, final 3000
    expect(result[1]!.limaDate).toBe('2026-05-14');
    expect(result[1]!.openingCents).toBe(5000);
    expect(result[1]!.dayTotalCents).toBe(-2000);
    expect(result[1]!.finalCents).toBe(3000);

    // Day 3: opening 3000, total +3000, final 6000
    expect(result[2]!.limaDate).toBe('2026-05-15');
    expect(result[2]!.openingCents).toBe(3000);
    expect(result[2]!.dayTotalCents).toBe(3000);
    expect(result[2]!.finalCents).toBe(6000);
  });

  it('handles entries that cross the UTC 05:00 boundary into the same Lima day', () => {
    // These all map to Lima date 2026-05-15 even though they span two UTC days:
    const entries = [
      { date: '2026-05-14', amountCents: 1000 },   // previous day
      { date: '2026-05-15', amountCents: 500 },     // from 2026-05-15T05:00:00Z
      { date: '2026-05-15', amountCents: 300 },     // from 2026-05-15T12:00:00Z
      { date: '2026-05-15', amountCents: 200 },     // from 2026-05-16T04:00:00Z (still 05-15 Lima)
    ];
    const result = computeLegacyBalances(entries);

    expect(result).toHaveLength(2);

    // Day 1 (05-14): opening 0, total 1000, final 1000
    expect(result[0]!.limaDate).toBe('2026-05-14');
    expect(result[0]!.openingCents).toBe(0);
    expect(result[0]!.dayTotalCents).toBe(1000);

    // Day 2 (05-15): opening 1000, total 1000 (500+300+200), final 2000
    expect(result[1]!.limaDate).toBe('2026-05-15');
    expect(result[1]!.openingCents).toBe(1000);
    expect(result[1]!.dayTotalCents).toBe(1000);
    expect(result[1]!.finalCents).toBe(2000);
  });

  it('handles zero-balance days', () => {
    const entries = [
      { date: '2026-05-13', amountCents: 5000 },
      { date: '2026-05-15', amountCents: 3000 },
      // 05-14 has no entries, so it doesn't appear as a group
    ];
    const result = computeLegacyBalances(entries);

    expect(result).toHaveLength(2);
    // Day 1 (05-13): opening 0, total 5000, final 5000
    expect(result[0]!.openingCents).toBe(0);
    // Day 2 (05-15): opening 5000 (carries over from 05-13), total 3000, final 8000
    expect(result[1]!.openingCents).toBe(5000);
    expect(result[1]!.dayTotalCents).toBe(3000);
    expect(result[1]!.finalCents).toBe(8000);
  });

  it('handles negative opening balances', () => {
    const entries = [
      { date: '2026-05-13', amountCents: -1000 },
      { date: '2026-05-14', amountCents: 500 },
    ];
    const result = computeLegacyBalances(entries);

    expect(result).toHaveLength(2);
    expect(result[0]!.openingCents).toBe(0);
    expect(result[0]!.finalCents).toBe(-1000);
    expect(result[1]!.openingCents).toBe(-1000);
    expect(result[1]!.finalCents).toBe(-500);
  });

  it('handles many entries across a week', () => {
    const entries = [
      { date: '2026-05-11', amountCents: 20000 },
      { date: '2026-05-12', amountCents: -5000 },
      { date: '2026-05-12', amountCents: -3000 },
      { date: '2026-05-13', amountCents: 15000 },
      { date: '2026-05-14', amountCents: 8000 },
      { date: '2026-05-15', amountCents: -2000 },
      { date: '2026-05-15', amountCents: 10000 },
      { date: '2026-05-16', amountCents: 5000 },
      { date: '2026-05-16', amountCents: 5000 },
      { date: '2026-05-16', amountCents: -1000 },
      { date: '2026-05-17', amountCents: 0 },
    ];
    const result = computeLegacyBalances(entries);

    expect(result).toHaveLength(7);
    // 05-11: opening 0, total 20000, final 20000
    expect(result[0]!.finalCents).toBe(20000);
    // 05-12: opening 20000, total -8000, final 12000
    expect(result[1]!.openingCents).toBe(20000);
    expect(result[1]!.dayTotalCents).toBe(-8000);
    expect(result[1]!.finalCents).toBe(12000);
    // 05-13: opening 12000, total 15000, final 27000
    expect(result[2]!.openingCents).toBe(12000);
    expect(result[2]!.dayTotalCents).toBe(15000);
    expect(result[2]!.finalCents).toBe(27000);
    // 05-16: opening 43000 (27000+8000-2000+10000), total 9000, final 52000
    expect(result[5]!.openingCents).toBe(43000);
    expect(result[5]!.dayTotalCents).toBe(9000);
    expect(result[5]!.finalCents).toBe(52000);
    // 05-17: opening 52000, total 0, final 52000
    expect(result[6]!.openingCents).toBe(52000);
    expect(result[6]!.dayTotalCents).toBe(0);
    expect(result[6]!.finalCents).toBe(52000);
  });
});

// ── Tests: Full backfill simulation ────────────────────────────────────

describe('Migration backfill: full end-to-end simulation', () => {
  it('simulates a realistic backfill scenario', () => {
    // Raw ledger entries with UTC timestamps (simulates real data)
    const utcTimestamps: [string, number][] = [
      // 05-13 entries
      ['2026-05-13T10:00:00Z', 5000],
      ['2026-05-13T11:30:00Z', 3000],
      // 05-14 entries (UTC day)
      ['2026-05-14T03:00:00Z', -2000], // 2026-05-13T22:00:00 Lima → still 05-13!
      ['2026-05-14T12:00:00Z', 4000],  // 2026-05-14T07:00:00 Lima → 05-14
      // 05-15 entries (UTC day)
      ['2026-05-15T04:00:00Z', 1000],  // 2026-05-14T23:00:00 Lima → still 05-14!
      ['2026-05-15T10:00:00Z', -1000], // 2026-05-15T05:00:00 Lima → 05-15
      // Late Lima entries
      ['2026-05-16T04:00:00Z', 2000],  // 2026-05-15T23:00:00 Lima → still 05-15!
      ['2026-05-16T12:00:00Z', 3000],  // 2026-05-16T07:00:00 Lima → 05-16
    ];

    // This simulates what the migration's GROUP BY (created_at AT TIME ZONE 'America/Lima')::date does
    const entries = utcTimestamps.map(([ts, amount]) => ({
      date: toLimaDate(new Date(ts)),
      amountCents: amount,
    }));

    // Run the backfill balance computation
    const result = computeLegacyBalances(entries);

    // Verify correct date grouping:
    // - 2026-05-13: entries at 10:00Z(5000) + 11:30Z(3000) + 14T03:00Z(-2000) = 6000
    // - 2026-05-14: entries at 14T12:00Z(4000) + 15T04:00Z(1000) = 5000
    // - 2026-05-15: entries at 15T10:00Z(-1000) + 16T04:00Z(2000) = 1000
    // - 2026-05-16: entries at 16T12:00Z(3000) = 3000

    expect(result).toHaveLength(4);

    expect(result[0]!.limaDate).toBe('2026-05-13');
    expect(result[0]!.dayTotalCents).toBe(6000);
    expect(result[0]!.finalCents).toBe(6000);

    expect(result[1]!.limaDate).toBe('2026-05-14');
    expect(result[1]!.openingCents).toBe(6000);
    expect(result[1]!.dayTotalCents).toBe(5000);
    expect(result[1]!.finalCents).toBe(11000);

    expect(result[2]!.limaDate).toBe('2026-05-15');
    expect(result[2]!.openingCents).toBe(11000);
    expect(result[2]!.dayTotalCents).toBe(1000);
    expect(result[2]!.finalCents).toBe(12000);

    expect(result[3]!.limaDate).toBe('2026-05-16');
    expect(result[3]!.openingCents).toBe(12000);
    expect(result[3]!.dayTotalCents).toBe(3000);
    expect(result[3]!.finalCents).toBe(15000);
  });
});
