/**
 * Unit tests for CashLedgerMapper.
 *
 * Verifies mapping of cashBoxId and concept between domain and persistence.
 */
import { describe, it, expect } from 'vitest';
import { CashLedgerMapper } from '../../../src/modules/accounting-reports/infrastructure/typeorm/CashLedgerMapper.js';
import { CashLedgerEntry } from '../../../src/modules/accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../src/modules/accounting-reports/domain/CashLedgerEntryId.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';
import { Money } from '../../../src/shared/domain/Money.js';

describe('CashLedgerMapper', () => {
  const mapper = new CashLedgerMapper();

  describe('toPersistence', () => {
    it('maps domain entry with cashBoxId and concept to entity', () => {
      const cashBoxId = CashBoxId.from('box-mapper-1');
      const entry = new CashLedgerEntry(
        CashLedgerEntryId.from('entry-1'),
        'MANUAL_ADJUSTMENT',
        Money.fromCents(2000),
        'adj-1',
        null,
        new Date('2026-05-15T12:00:00Z'),
        cashBoxId,
        'Ajuste por diferencia',
      );

      const entity = mapper.toPersistence(entry);

      expect(entity.cashBoxId).toBe(cashBoxId.value);
      expect(entity.concept).toBe('Ajuste por diferencia');
      expect(entity.id).toBe('entry-1');
      expect(entity.amountCents).toBe(2000);
    });

    it('maps legacy entry without cashBoxId or concept', () => {
      const entry = new CashLedgerEntry(
        CashLedgerEntryId.from('legacy-entry'),
        'SALE_INCOME',
        Money.fromCents(5000),
        'sale-1',
        null,
        new Date('2026-05-14T12:00:00Z'),
      );

      const entity = mapper.toPersistence(entry);

      expect(entity.cashBoxId).toBeNull();
      expect(entity.concept).toBeNull();
    });
  });
});
