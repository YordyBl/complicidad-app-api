import { describe, it, expect } from 'vitest';
import { ok, err, Ok, Err } from '../../../src/shared/domain/Result.js';

class TestError extends Error {
  override readonly name = 'TestError';
}

describe('Result', () => {
  // ── Ok ──────────────────────────────────────────────────────────

  describe('ok', () => {
    it('creates an Ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
    });

    it('has Ok type guard', () => {
      const result = ok(42);
      if (result.ok) {
        expect(result.value).toBe(42);
      } else {
        // TypeScript narrows correctly — this branch is unreachable
        expect.unreachable('should not be Err');
      }
    });

    it('unwrap returns the value', () => {
      expect(ok(42).unwrap()).toBe(42);
    });

    it('unwrapOr returns the value', () => {
      expect(ok(42).unwrapOr(0)).toBe(42);
    });

    it('map transforms the value', () => {
      const result = ok(21).map((x) => x * 2);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });

    it('mapErr is a no-op', () => {
      const result = ok<number, TestError>(42).mapErr((e: TestError) => new Error(`wrapped: ${e.message}`));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });

    it('flatMap chains', () => {
      const result = ok(21).flatMap((x) => ok(x * 2));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });

    it('flatMap can fail', () => {
      const result = ok(21).flatMap((_x) => err(new TestError('fail')));
      expect(result.ok).toBe(false);
    });
  });

  // ── Err ─────────────────────────────────────────────────────────

  describe('err', () => {
    it('creates an Err result', () => {
      const result = err(new TestError('something went wrong'));
      expect(result.ok).toBe(false);
    });

    it('has Err type guard', () => {
      const result = err(new TestError('fail'));
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TestError);
        expect(result.error.message).toBe('fail');
      } else {
        expect.unreachable('should not be Ok');
      }
    });

    it('unwrap throws the error', () => {
      const error = new TestError('boom');
      expect(() => err(error).unwrap()).toThrow(error);
    });

    it('unwrapOr returns the default', () => {
      const result = err<number>(new TestError('fail'));
      expect(result.unwrapOr(0)).toBe(0);
    });

    it('map is a no-op', () => {
      const result = err<number>(new TestError('fail')).map((x) => x * 2);
      expect(result.ok).toBe(false);
    });

    it('mapErr transforms the error', () => {
      const result = err<number, TestError>(new TestError('original'))
        .mapErr((e: TestError) => new Error(`wrapped: ${e.message}`));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('wrapped: original');
      }
    });

    it('flatMap is a no-op', () => {
      const result = err<number>(new TestError('fail')).flatMap((x) => ok(x * 2));
      expect(result.ok).toBe(false);
    });
  });

  // ── Type narrowing ──────────────────────────────────────────────

  describe('type narrowing', () => {
    it('Ok and Err are discriminated by the ok property', () => {
      const results = [ok(1), err(new TestError('e1')), ok(2), err(new TestError('e2'))];

      const values: number[] = [];
      const errors: TestError[] = [];

      for (const r of results) {
        if (r.ok) {
          values.push(r.value);
        } else {
          errors.push(r.error);
        }
      }

      expect(values).toEqual([1, 2]);
      expect(errors).toHaveLength(2);
    });
  });

  // ── Constructor types ───────────────────────────────────────────

  it('Ok constructor creates Ok instances', () => {
    const result = new Ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  it('Err constructor creates Err instances', () => {
    const error = new TestError('fail');
    const result = new Err(error);
    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
  });
});
