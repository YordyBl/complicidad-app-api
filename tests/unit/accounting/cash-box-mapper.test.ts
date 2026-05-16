/**
 * Unit tests for CashBoxMapper.
 *
 * Verifies bidirectional mapping between domain CashBox aggregate
 * and TypeORM CashBoxEntity.
 */
import { describe, it, expect } from 'vitest';
import { CashBoxMapper } from '../../../src/modules/accounting-reports/infrastructure/typeorm/CashBoxMapper.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';

describe('CashBoxMapper', () => {
  const mapper = new CashBoxMapper();

  describe('toDomain', () => {
    it('maps OPEN entity to domain aggregate', () => {
      const entity = {
        id: 'box-entity-1',
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 5000,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date('2026-05-15T12:00:00Z'),
        updatedAt: new Date('2026-05-15T12:00:00Z'),
      };

      const domain = mapper.toDomain(entity);

      expect(domain.id.toString()).toBe('box-entity-1');
      expect(domain.businessDate).toBe('2026-05-15');
      expect(domain.status).toBe('OPEN');
      expect(domain.openingBalanceCents).toBe(0);
      expect(domain.currentBalanceCents).toBe(5000);
      expect(domain.finalBalanceCents).toBeNull();
      expect(domain.closedAt).toBeNull();
      expect(domain.legacy).toBe(false);
      expect(domain.createdAt).toEqual(new Date('2026-05-15T12:00:00Z'));
    });

    it('maps CLOSED entity with final balance and closedAt', () => {
      const closedAt = new Date('2026-05-15T23:00:00Z');
      const entity = {
        id: 'box-closed-1',
        businessDate: '2026-05-14',
        status: 'CLOSED',
        openingBalanceCents: 1000,
        currentBalanceCents: 5000,
        finalBalanceCents: 5000,
        closedAt,
        legacy: false,
        createdAt: new Date('2026-05-14T05:00:00Z'),
        updatedAt: new Date('2026-05-14T23:00:00Z'),
      };

      const domain = mapper.toDomain(entity);

      expect(domain.id.toString()).toBe('box-closed-1');
      expect(domain.status).toBe('CLOSED');
      expect(domain.finalBalanceCents).toBe(5000);
      expect(domain.closedAt).toEqual(closedAt);
    });

    it('maps legacy entity with legacy flag true', () => {
      const entity = {
        id: 'box-legacy-1',
        businessDate: '2025-01-01',
        status: 'CLOSED',
        openingBalanceCents: 0,
        currentBalanceCents: 0,
        finalBalanceCents: 0,
        closedAt: new Date('2025-01-01T23:00:00Z'),
        legacy: true,
        createdAt: new Date('2025-01-01T05:00:00Z'),
        updatedAt: new Date('2025-01-01T23:00:00Z'),
      };

      const domain = mapper.toDomain(entity);

      expect(domain.legacy).toBe(true);
      expect(domain.status).toBe('CLOSED');
    });
  });

  describe('toPersistence', () => {
    it('maps OPEN domain aggregate to entity', () => {
      const id = CashBoxId.from('box-persist-1');
      const now = new Date('2026-05-15T12:00:00Z');
      const domain = new CashBox({
        id,
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 5000,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: now,
      });

      const entity = mapper.toPersistence(domain);

      expect(entity.id).toBe('box-persist-1');
      expect(entity.businessDate).toBe('2026-05-15');
      expect(entity.status).toBe('OPEN');
      expect(entity.openingBalanceCents).toBe(0);
      expect(entity.currentBalanceCents).toBe(5000);
      expect(entity.finalBalanceCents).toBeNull();
      expect(entity.closedAt).toBeNull();
      expect(entity.legacy).toBe(false);
      expect(entity.createdAt).toEqual(now);
    });

    it('maps CLOSED domain aggregate with final fields', () => {
      const id = CashBoxId.from('box-persist-closed');
      const createdAt = new Date('2026-05-14T05:00:00Z');

      // Create OPEN then close to get a valid CLOSED state
      const open = new CashBox({
        id,
        businessDate: '2026-05-14',
        status: 'OPEN',
        openingBalanceCents: 1000,
        currentBalanceCents: 5000,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt,
      });
      const domain = open.close(5000);

      const entity = mapper.toPersistence(domain);

      expect(entity.id).toBe('box-persist-closed');
      expect(entity.status).toBe('CLOSED');
      expect(entity.finalBalanceCents).toBe(5000);
      expect(entity.closedAt).toBeInstanceOf(Date);
      expect(entity.openingBalanceCents).toBe(1000);
      expect(entity.currentBalanceCents).toBe(5000);
    });

    it('preserves entity identity across roundtrip', () => {
      const entity = {
        id: 'roundtrip-1',
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 0,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date('2026-05-15T12:00:00Z'),
        updatedAt: new Date('2026-05-15T12:00:00Z'),
      };

      const domain = mapper.toDomain(entity);
      const result = mapper.toPersistence(domain);

      expect(result.id).toBe('roundtrip-1');
      expect(result.businessDate).toBe('2026-05-15');
      expect(result.status).toBe('OPEN');
      expect(result.openingBalanceCents).toBe(0);
      expect(result.currentBalanceCents).toBe(0);
      expect(result.finalBalanceCents).toBeNull();
      expect(result.closedAt).toBeNull();
      expect(result.legacy).toBe(false);
    });
  });
});
