/**
 * Pure helper to compute the America/Lima business date for a given UTC Date.
 *
 * Lima is UTC-5 year-round (no DST). A Lima business date flips at
 * 05:00 UTC (= 00:00 Lima time).
 *
 * Returns a YYYY-MM-DD string suitable for CashBox.businessDate.
 *
 * @example
 * ```ts
 * toLimaBusinessDate(new Date('2026-05-15T04:59:59Z')) // "2026-05-14"
 * toLimaBusinessDate(new Date('2026-05-15T05:00:00Z')) // "2026-05-15"
 * ```
 */

const LIMA_TIMEZONE = 'America/Lima';
const ISO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: LIMA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toLimaBusinessDate(date: Date): string {
  return ISO_DATE_FORMATTER.format(date);
}
