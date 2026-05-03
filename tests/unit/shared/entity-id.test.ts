import { describe, it, expect } from 'vitest';
import { EntityId, EntityIdError } from '../../../src/shared/domain/EntityId.js';

class TestId extends EntityId {
  static from(value: string): TestId {
    return new TestId(value);
  }
}

class OtherId extends EntityId {
  static from(value: string): OtherId {
    return new OtherId(value);
  }
}

describe('EntityId', () => {
  describe('construction', () => {
    it('creates an EntityId from a valid string', () => {
      const id = TestId.from('abc-123');
      expect(id.value).toBe('abc-123');
    });

    it('trims whitespace', () => {
      const id = TestId.from('  abc-123  ');
      expect(id.value).toBe('abc-123');
    });

    it('throws EntityIdError for empty string', () => {
      expect(() => TestId.from('')).toThrow(EntityIdError);
    });

    it('throws EntityIdError for whitespace-only string', () => {
      expect(() => TestId.from('   ')).toThrow(EntityIdError);
    });
  });

  describe('equals', () => {
    it('same type and value are equal', () => {
      const a = TestId.from('abc');
      const b = TestId.from('abc');
      expect(a.equals(b)).toBe(true);
    });

    it('same type different value are not equal', () => {
      const a = TestId.from('abc');
      const b = TestId.from('xyz');
      expect(a.equals(b)).toBe(false);
    });

    it('different types with same value are not equal', () => {
      const a = TestId.from('abc');
      const b = OtherId.from('abc');
      expect(a.equals(b)).toBe(false);
    });

    it('null/undefined returns false', () => {
      const a = TestId.from('abc');
      expect(a.equals(null)).toBe(false);
      expect(a.equals(undefined)).toBe(false);
    });
  });

  describe('serialization', () => {
    it('toString returns the raw value', () => {
      const id = TestId.from('abc-123');
      expect(id.toString()).toBe('abc-123');
    });

    it('toJSON returns the raw value', () => {
      const id = TestId.from('abc-123');
      expect(JSON.stringify(id)).toBe('"abc-123"');
    });
  });

  describe('immutability', () => {
    it('is frozen', () => {
      const id = TestId.from('abc');
      expect(Object.isFrozen(id)).toBe(true);
    });
  });
});
