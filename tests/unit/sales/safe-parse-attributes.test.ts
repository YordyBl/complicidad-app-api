/**
 * Unit tests for safeParseAttributes — JSONB normaliser.
 *
 * Verifies that PostgreSQL/TyORM JSONB values are safely parsed
 * regardless of whether they arrive as objects or strings.
 */
import { describe, it, expect } from 'vitest';
import { safeParseAttributes } from '../../../src/modules/sales-returns/infrastructure/typeorm/TypeOrmSaleListItemReadRepository.js';

describe('safeParseAttributes', () => {
  it('returns empty object for null', () => {
    expect(safeParseAttributes(null)).toEqual({});
  });

  it('returns empty object for undefined', () => {
    expect(safeParseAttributes(undefined)).toEqual({});
  });

  it('preserves already-parsed plain object (TypeORM driver behaviour)', () => {
    const obj = { color: 'Rojo', talle: 'M' };
    expect(safeParseAttributes(obj)).toEqual({ color: 'Rojo', talle: 'M' });
  });

  it('parses valid JSON string into object', () => {
    const json = '{"color":"Negro","talle":"L"}';
    expect(safeParseAttributes(json)).toEqual({ color: 'Negro', talle: 'L' });
  });

  it('returns empty object for malformed JSON string', () => {
    expect(safeParseAttributes('{not valid json')).toEqual({});
  });

  it('returns empty object for a JSON array (not a record)', () => {
    expect(safeParseAttributes('[1, 2, 3]')).toEqual({});
  });

  it('returns empty object for a plain array (already parsed)', () => {
    expect(safeParseAttributes([1, 2, 3])).toEqual({});
  });

  it('returns empty object for a JSON number', () => {
    expect(safeParseAttributes('42')).toEqual({});
  });

  it('returns empty object for a JSON boolean', () => {
    expect(safeParseAttributes('true')).toEqual({});
  });

  it('returns empty object for an already-parsed string primitive', () => {
    // Unlikely but safe — raw string that isn't JSON
    expect(safeParseAttributes('hello')).toEqual({});
  });

  it('preserves object with empty values ({} is valid)', () => {
    expect(safeParseAttributes({})).toEqual({});
  });

  it('parses JSON string with empty object', () => {
    expect(safeParseAttributes('{}')).toEqual({});
  });
});
