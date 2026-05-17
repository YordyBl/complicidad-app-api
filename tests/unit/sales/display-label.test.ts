/**
 * Unit tests for computeDisplayLabel pure function.
 *
 * Verifies the human-readable fallback chain:
 *   productName → SKU → "Variante sin datos"
 */
import { describe, it, expect } from 'vitest';
import { computeDisplayLabel } from '../../../src/modules/sales-returns/application/ports/SaleListItemReadRepository.js';

describe('computeDisplayLabel', () => {
  it('returns productName when available', () => {
    expect(computeDisplayLabel('Camiseta', 'CAM-BLA-M')).toBe('Camiseta');
  });

  it('returns productName even when SKU is also available', () => {
    expect(computeDisplayLabel('Pantalón', 'PAN-AZU-L')).toBe('Pantalón');
  });

  it('falls back to SKU when productName is null', () => {
    expect(computeDisplayLabel(null, 'PANT-NEG-M')).toBe('PANT-NEG-M');
  });

  it('falls back to SKU when productName is empty string', () => {
    expect(computeDisplayLabel('', 'BUF-GRI-U')).toBe('BUF-GRI-U');
  });

  it('returns "Variante sin datos" when productName is null and SKU is null', () => {
    expect(computeDisplayLabel(null, null)).toBe('Variante sin datos');
  });

  it('returns "Variante sin datos" when both are empty strings', () => {
    expect(computeDisplayLabel('', '')).toBe('Variante sin datos');
  });

  it('returns "Variante sin datos" when productName is null and SKU is empty', () => {
    expect(computeDisplayLabel(null, '')).toBe('Variante sin datos');
  });

  it('returns productName with whitespace-only SKU (productName wins)', () => {
    expect(computeDisplayLabel('Bufanda', '   ')).toBe('Bufanda');
  });

  it('does NOT leak variantId or raw IDs as fallback', () => {
    const result = computeDisplayLabel(null, null);
    expect(result).toBe('Variante sin datos');
    // Must not be a UUID or DB-style identifier
    expect(result).not.toMatch(/^[0-9a-f-]{8,}$/);
  });
});
