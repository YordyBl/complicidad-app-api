import { describe, it, expect } from 'vitest';
import { Money, MoneyError } from '../../../src/shared/domain/Money.js';

describe('Money', () => {
  // ── Factory: fromCents ──────────────────────────────────────────

  describe('fromCents', () => {
    it('creates Money from positive integer cents', () => {
      const m = Money.fromCents(1250);
      expect(m.cents).toBe(1250);
    });

    it('creates Money from zero', () => {
      const m = Money.fromCents(0);
      expect(m.cents).toBe(0);
    });

    it('creates Money from negative integer cents', () => {
      const m = Money.fromCents(-500);
      expect(m.cents).toBe(-500);
    });

    it('throws MoneyError for non-integer cents', () => {
      expect(() => Money.fromCents(12.5)).toThrow(MoneyError);
    });
  });

  // ── Factory: fromDecimal ────────────────────────────────────────

  describe('fromDecimal', () => {
    it('creates Money from "12.50"', () => {
      const m = Money.fromDecimal('12.50');
      expect(m.cents).toBe(1250);
    });

    it('creates Money from "0.99"', () => {
      const m = Money.fromDecimal('0.99');
      expect(m.cents).toBe(99);
    });

    it('creates Money from integer string "5"', () => {
      const m = Money.fromDecimal('5');
      expect(m.cents).toBe(500);
    });

    it('creates Money from "5.00"', () => {
      const m = Money.fromDecimal('5.00');
      expect(m.cents).toBe(500);
    });

    it('creates Money from negative decimal "-3.50"', () => {
      const m = Money.fromDecimal('-3.50');
      expect(m.cents).toBe(-350);
    });

    it('throws MoneyError for invalid format "12.345" (3 decimals)', () => {
      expect(() => Money.fromDecimal('12.345')).toThrow(MoneyError);
    });

    it('throws MoneyError for empty string', () => {
      expect(() => Money.fromDecimal('')).toThrow(MoneyError);
    });

    it('throws MoneyError for non-numeric string', () => {
      expect(() => Money.fromDecimal('abc')).toThrow(MoneyError);
    });
  });

  // ── Constant: ZERO ──────────────────────────────────────────────

  describe('ZERO', () => {
    it('is a zero-cents Money', () => {
      expect(Money.ZERO.cents).toBe(0);
      expect(Money.ZERO.isZero()).toBe(true);
    });

    it('is a frozen singleton', () => {
      expect(Object.isFrozen(Money.ZERO)).toBe(true);
    });
  });

  // ── Serialization ───────────────────────────────────────────────

  describe('toDecimalString', () => {
    it('formats positive cents as "12.50"', () => {
      expect(Money.fromCents(1250).toDecimalString()).toBe('12.50');
    });

    it('formats zero as "0.00"', () => {
      expect(Money.ZERO.toDecimalString()).toBe('0.00');
    });

    it('formats negative as "-3.50"', () => {
      expect(Money.fromCents(-350).toDecimalString()).toBe('-3.50');
    });

    it('formats single-digit cents as "0.05"', () => {
      expect(Money.fromCents(5).toDecimalString()).toBe('0.05');
    });
  });

  describe('toString', () => {
    it('formats positive with $ prefix', () => {
      expect(Money.fromCents(1250).toString()).toBe('$12.50');
    });

    it('formats negative with -$ prefix', () => {
      expect(Money.fromCents(-350).toString()).toBe('-$3.50');
    });
  });

  // ── Arithmetic ──────────────────────────────────────────────────

  describe('add', () => {
    it('adds two amounts', () => {
      const a = Money.fromCents(100);
      const b = Money.fromCents(250);
      expect(a.add(b).cents).toBe(350);
    });

    it('handles negative addition (subtraction)', () => {
      const a = Money.fromCents(500);
      const b = Money.fromCents(-200);
      expect(a.add(b).cents).toBe(300);
    });

    it('is commutative', () => {
      const a = Money.fromCents(100);
      const b = Money.fromCents(200);
      expect(a.add(b).equals(b.add(a))).toBe(true);
    });
  });

  describe('subtract', () => {
    it('subtracts two amounts', () => {
      const a = Money.fromCents(500);
      const b = Money.fromCents(200);
      expect(a.subtract(b).cents).toBe(300);
    });

    it('handles negative subtraction', () => {
      const a = Money.fromCents(100);
      const b = Money.fromCents(-50);
      expect(a.subtract(b).cents).toBe(150);
    });
  });

  describe('multiply', () => {
    it('multiplies by integer factor', () => {
      const m = Money.fromCents(100);
      expect(m.multiply(3).cents).toBe(300);
    });

    it('rounds to nearest cent (half-up)', () => {
      const m = Money.fromCents(10); // $0.10
      // 0.10 * 1.05 = 0.105 -> rounds to 0.11 (11 cents)
      expect(m.multiply(1.05).cents).toBe(11);
    });

    it('multiplying zero stays zero', () => {
      expect(Money.ZERO.multiply(100).cents).toBe(0);
    });
  });

  describe('divide', () => {
    it('divides by integer divisor', () => {
      const m = Money.fromCents(1000);
      expect(m.divide(5).cents).toBe(200);
    });

    it('rounds to nearest cent', () => {
      const m = Money.fromCents(10); // $0.10
      // 10 / 3 = 3.333 -> rounds to 3 cents
      expect(m.divide(3).cents).toBe(3);
    });

    it('throws MoneyError for division by zero', () => {
      expect(() => Money.fromCents(100).divide(0)).toThrow(MoneyError);
    });
  });

  describe('negate', () => {
    it('returns opposite sign', () => {
      expect(Money.fromCents(500).negate().cents).toBe(-500);
      expect(Money.fromCents(-300).negate().cents).toBe(300);
    });

    it('zero negated is zero', () => {
      expect(Money.ZERO.negate().isZero()).toBe(true);
    });
  });

  describe('abs', () => {
    it('returns positive for positive', () => {
      expect(Money.fromCents(500).abs().cents).toBe(500);
    });

    it('returns positive for negative', () => {
      expect(Money.fromCents(-500).abs().cents).toBe(500);
    });
  });

  // ── Comparators ─────────────────────────────────────────────────

  describe('equals', () => {
    it('two Moneys with same cents are equal', () => {
      expect(Money.fromCents(100).equals(Money.fromCents(100))).toBe(true);
    });

    it('different cents are not equal', () => {
      expect(Money.fromCents(100).equals(Money.fromCents(101))).toBe(false);
    });
  });

  describe('comparison operators', () => {
    const small = Money.fromCents(100);
    const large = Money.fromCents(200);

    it('greaterThan', () => {
      expect(large.greaterThan(small)).toBe(true);
      expect(small.greaterThan(large)).toBe(false);
    });

    it('greaterThanOrEqual', () => {
      expect(large.greaterThanOrEqual(small)).toBe(true);
      expect(large.greaterThanOrEqual(large)).toBe(true);
      expect(small.greaterThanOrEqual(large)).toBe(false);
    });

    it('lessThan', () => {
      expect(small.lessThan(large)).toBe(true);
      expect(large.lessThan(small)).toBe(false);
    });

    it('lessThanOrEqual', () => {
      expect(small.lessThanOrEqual(large)).toBe(true);
      expect(small.lessThanOrEqual(small)).toBe(true);
      expect(large.lessThanOrEqual(small)).toBe(false);
    });
  });

  // ── Predicates ──────────────────────────────────────────────────

  describe('isPositive', () => {
    it('returns true for positive money', () => {
      expect(Money.fromCents(1).isPositive()).toBe(true);
    });

    it('returns false for zero', () => {
      expect(Money.ZERO.isPositive()).toBe(false);
    });

    it('returns false for negative', () => {
      expect(Money.fromCents(-1).isPositive()).toBe(false);
    });
  });

  describe('isNegative', () => {
    it('returns true for negative money', () => {
      expect(Money.fromCents(-1).isNegative()).toBe(true);
    });

    it('returns false for zero', () => {
      expect(Money.ZERO.isNegative()).toBe(false);
    });
  });

  describe('isZero', () => {
    it('returns true for zero', () => {
      expect(Money.ZERO.isZero()).toBe(true);
      expect(Money.fromCents(0).isZero()).toBe(true);
    });

    it('returns false for non-zero', () => {
      expect(Money.fromCents(1).isZero()).toBe(false);
      expect(Money.fromCents(-1).isZero()).toBe(false);
    });
  });

  // ── Immutability ────────────────────────────────────────────────

  describe('immutability', () => {
    it('is frozen after construction', () => {
      const m = Money.fromCents(100);
      expect(Object.isFrozen(m)).toBe(true);
    });

    it('arithmetic returns new instances', () => {
      const a = Money.fromCents(100);
      const b = Money.fromCents(200);
      const sum = a.add(b);

      // Original values unchanged
      expect(a.cents).toBe(100);
      expect(b.cents).toBe(200);
      expect(sum.cents).toBe(300);
    });
  });
});
