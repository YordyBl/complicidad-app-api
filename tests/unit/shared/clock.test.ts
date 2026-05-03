import { describe, it, expect, vi, afterEach } from 'vitest';
import { SystemClock } from '../../../src/shared/domain/Clock.js';

describe('SystemClock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a Date instance', () => {
    const clock = new SystemClock();
    expect(clock.now()).toBeInstanceOf(Date);
  });

  it('returns the current time', () => {
    // Mock Date to verify the clock delegates correctly
    const expected = new Date('2026-05-02T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(expected);

    const clock = new SystemClock();
    expect(clock.now()).toEqual(expected);

    vi.useRealTimers();
  });

  it('returns different values as time passes', () => {
    const clock = new SystemClock();
    const before = clock.now();

    // Small delay
    const after = clock.now();
    expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
