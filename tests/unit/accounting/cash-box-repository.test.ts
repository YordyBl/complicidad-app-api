/**
 * Unit tests for CashBoxTypeOrmRepository.
 *
 * Uses a mocked TypeORM Repository to verify query construction
 * and delegate calls without a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CashBoxTypeOrmRepository } from '../../../src/modules/accounting-reports/infrastructure/typeorm/CashBoxTypeOrmRepository.js';
import { CashBox } from '../../../src/modules/accounting-reports/domain/CashBox.js';
import { CashBoxId } from '../../../src/modules/accounting-reports/domain/CashBoxId.js';

describe('CashBoxTypeOrmRepository', () => {
  // ── Mock setup ──────────────────────────────────────────────
  const mockFindOne = vi.fn();
  const mockFind = vi.fn();
  const mockSave = vi.fn();
  const mockGetRepository = vi.fn(() => ({
    findOne: mockFindOne,
    find: mockFind,
    save: mockSave,
  }));
  const mockManager = { getRepository: mockGetRepository };

  let repo: CashBoxTypeOrmRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new CashBoxTypeOrmRepository(mockManager as never);
  });

  // ── Helpers ──────────────────────────────────────────────────

  function createOpenBox(id: string, businessDate: string, currentCents = 0): CashBox {
    return new CashBox({
      id: CashBoxId.from(id),
      businessDate,
      status: 'OPEN',
      openingBalanceCents: 0,
      currentBalanceCents: currentCents,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: new Date(),
    });
  }

  describe('save', () => {
    it('delegates to TypeORM repository save', async () => {
      const box = createOpenBox('box-save-1', '2026-05-15');

      await repo.save(box);

      expect(mockSave).toHaveBeenCalledTimes(1);
      const savedEntity = mockSave.mock.calls[0]?.[0];
      expect(savedEntity?.id).toBe('box-save-1');
      expect(savedEntity?.status).toBe('OPEN');
    });
  });

  describe('findByBusinessDate', () => {
    it('returns domain object when entity is found', async () => {
      mockFindOne.mockResolvedValue({
        id: 'box-date-1',
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 5000,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date('2026-05-15T12:00:00Z'),
        updatedAt: new Date('2026-05-15T12:00:00Z'),
      });

      const result = await repo.findByBusinessDate('2026-05-15');

      expect(result).not.toBeNull();
      expect(result!.id.toString()).toBe('box-date-1');
      expect(result!.businessDate).toBe('2026-05-15');
      expect(result!.status).toBe('OPEN');
      expect(mockFindOne).toHaveBeenCalledWith({
        where: { businessDate: '2026-05-15' },
      });
    });

    it('returns null when no entity matches', async () => {
      mockFindOne.mockResolvedValue(null);

      const result = await repo.findByBusinessDate('2099-01-01');

      expect(result).toBeNull();
    });
  });

  describe('findCurrent', () => {
    it('returns the OPEN box for today', async () => {
      mockFindOne.mockResolvedValue({
        id: 'box-current-1',
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 5000,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date('2026-05-15T12:00:00Z'),
        updatedAt: new Date('2026-05-15T12:00:00Z'),
      });

      const result = await repo.findCurrent();

      expect(result).not.toBeNull();
      expect(result!.status).toBe('OPEN');
      expect(mockFindOne).toHaveBeenCalledWith({
        where: { status: 'OPEN' },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns null when no OPEN box exists', async () => {
      mockFindOne.mockResolvedValue(null);

      const result = await repo.findCurrent();

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns domain object when found', async () => {
      mockFindOne.mockResolvedValue({
        id: 'box-by-id-1',
        businessDate: '2026-05-15',
        status: 'OPEN',
        openingBalanceCents: 0,
        currentBalanceCents: 5000,
        finalBalanceCents: null,
        closedAt: null,
        legacy: false,
        createdAt: new Date('2026-05-15T12:00:00Z'),
        updatedAt: new Date('2026-05-15T12:00:00Z'),
      });

      const result = await repo.findById(CashBoxId.from('box-by-id-1'));

      expect(result).not.toBeNull();
      expect(result!.id.toString()).toBe('box-by-id-1');
      expect(mockFindOne).toHaveBeenCalledWith({
        where: { id: 'box-by-id-1' },
      });
    });

    it('returns null when not found', async () => {
      mockFindOne.mockResolvedValue(null);

      const result = await repo.findById(CashBoxId.from('nonexistent'));

      expect(result).toBeNull();
    });
  });

  describe('findAllOrdered', () => {
    it('returns all boxes ordered by businessDate descending', async () => {
      mockFind.mockResolvedValue([
        {
          id: 'box-1',
          businessDate: '2026-05-15',
          status: 'OPEN',
          openingBalanceCents: 0,
          currentBalanceCents: 1000,
          finalBalanceCents: null,
          closedAt: null,
          legacy: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'box-2',
          businessDate: '2026-05-14',
          status: 'CLOSED',
          openingBalanceCents: 0,
          currentBalanceCents: 500,
          finalBalanceCents: 500,
          closedAt: new Date(),
          legacy: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const results = await repo.findAllOrdered();

      expect(results).toHaveLength(2);
      expect(results[0]!.businessDate).toBe('2026-05-15');
      expect(results[1]!.businessDate).toBe('2026-05-14');
      expect(mockFind).toHaveBeenCalledWith({
        order: { businessDate: 'DESC' },
      });
    });

    it('returns empty array when no boxes exist', async () => {
      mockFind.mockResolvedValue([]);

      const results = await repo.findAllOrdered();

      expect(results).toEqual([]);
    });
  });

  describe('findLastClosed', () => {
    it('returns the most recently closed box', async () => {
      mockFindOne.mockResolvedValue({
        id: 'box-last-closed',
        businessDate: '2026-05-14',
        status: 'CLOSED',
        openingBalanceCents: 0,
        currentBalanceCents: 5000,
        finalBalanceCents: 5000,
        closedAt: new Date('2026-05-14T23:00:00Z'),
        legacy: false,
        createdAt: new Date('2026-05-14T05:00:00Z'),
        updatedAt: new Date('2026-05-14T23:00:00Z'),
      });

      const result = await repo.findLastClosed();

      expect(result).not.toBeNull();
      expect(result!.status).toBe('CLOSED');
      expect(mockFindOne).toHaveBeenCalledWith({
        where: { status: 'CLOSED', legacy: false },
        order: { closedAt: 'DESC' },
      });
    });

    it('returns null when no non-legacy closed boxes', async () => {
      mockFindOne.mockResolvedValue(null);

      const result = await repo.findLastClosed();

      expect(result).toBeNull();
    });
  });
});
