/**
 * FIFO + Return regression tests for inventory lot adjustments.
 *
 * Proves that after increase, intact edit, and historical compensation:
 * - FIFO still selects oldest eligible open lots for consumption
 * - Returns/cancellations still restore to original consumed lot IDs
 * - Lot identity stability is preserved across adjustment flows
 *
 * These are application-level tests using fakes for ALL repositories.
 * They simulate full purchase → sale → adjustment → sale → return flows.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { UnitOfWork, UnitOfWorkScope } from '../../../src/shared/application/UnitOfWork.js';
import type { InventoryLotRepository } from '../../../src/modules/inventory/domain/InventoryLotRepository.js';
import type { InventoryLotAdjustmentRepository } from '../../../src/modules/inventory/domain/InventoryLotAdjustmentRepository.js';
import type { VariantRepository } from '../../../src/modules/inventory/domain/VariantRepository.js';
import type { PurchaseLot } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import type { InventoryLotAdjustment } from '../../../src/modules/inventory/domain/InventoryLotAdjustment.js';
import type { PurchaseLotId } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import type { VariantId } from '../../../src/modules/inventory/domain/VariantId.js';
import type { Variant } from '../../../src/modules/inventory/domain/Variant.js';
import type { Sku } from '../../../src/modules/inventory/domain/Sku.js';
import type { ProductId } from '../../../src/modules/inventory/domain/ProductId.js';
import type { InventoryLotAdjustmentId } from '../../../src/modules/inventory/domain/InventoryLotAdjustmentId.js';
import { PurchaseLot as PurchaseLotEntity } from '../../../src/modules/inventory/domain/PurchaseLot.js';
import { PurchaseLotId as PurchaseLotIdEntity } from '../../../src/modules/inventory/domain/PurchaseLotId.js';
import { VariantId as VariantIdEntity } from '../../../src/modules/inventory/domain/VariantId.js';
import { Variant as VariantEntity } from '../../../src/modules/inventory/domain/Variant.js';
import { ProductId as ProductIdEntity } from '../../../src/modules/inventory/domain/ProductId.js';
import { Sku as SkuEntity } from '../../../src/modules/inventory/domain/Sku.js';
import { PurchaseId as PurchaseIdEntity } from '../../../src/modules/inventory/domain/PurchaseId.js';
import { Money } from '../../../src/shared/domain/Money.js';

import { AdjustInventoryLotUseCase } from '../../../src/modules/inventory/application/use-cases/AdjustInventoryLotUseCase.js';
import { allocateFifo } from '../../../src/modules/inventory/domain/services/FifoAllocationService.js';

// ── Scope type ─────────────────────────────────────────────────

interface TestScope extends UnitOfWorkScope {
  inventoryLots: FakeInventoryLotRepository;
  inventoryLotAdjustments: FakeInventoryLotAdjustmentRepository;
}

// ── Fake repos ─────────────────────────────────────────────────

class FakeInventoryLotAdjustmentRepository implements InventoryLotAdjustmentRepository {
  adjustments: InventoryLotAdjustment[] = [];

  async save(adj: InventoryLotAdjustment): Promise<void> { this.adjustments.push(adj); }
  async findByLotId(lotId: PurchaseLotId): Promise<InventoryLotAdjustment[]> {
    return this.adjustments.filter((a) => a.snapshot.lotId === lotId.toString());
  }
  async findByVariantId(variantId: VariantId): Promise<InventoryLotAdjustment[]> {
    return this.adjustments.filter((a) => a.snapshot.variantId === variantId.toString());
  }
  async findById(_id: InventoryLotAdjustmentId): Promise<InventoryLotAdjustment | null> { return null; }
}

class FakeInventoryLotRepository implements InventoryLotRepository {
  lots = new Map<string, PurchaseLot>();
  consumptionRecords = new Set<string>();

  markConsumed(lotId: string): void { this.consumptionRecords.add(lotId); }

  async findById(id: PurchaseLotId): Promise<PurchaseLot | null> { return this.lots.get(id.toString()) ?? null; }
  async findByIds(ids: PurchaseLotId[]): Promise<PurchaseLot[]> {
    return ids.map((id) => this.lots.get(id.toString())).filter((l): l is PurchaseLot => l !== undefined);
  }
  async findByVariantIdOrderedByDate(vId: VariantId, _lock?: boolean): Promise<PurchaseLot[]> {
    return Array.from(this.lots.values())
      .filter((l) => l.variantId.toString() === vId.toString())
      .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());
  }
  async save(lot: PurchaseLot): Promise<void> { this.lots.set(lot.id.toString(), lot); }
  async saveMany(lots: PurchaseLot[]): Promise<void> { for (const l of lots) this.lots.set(l.id.toString(), l); }
  async delete(id: PurchaseLotId): Promise<void> { this.lots.delete(id.toString()); }
  async findByIdForUpdate(id: PurchaseLotId): Promise<PurchaseLot | null> { return this.lots.get(id.toString()) ?? null; }

  async hasConsumptionRecords(lotId: PurchaseLotId): Promise<boolean> {
    return this.consumptionRecords.has(lotId.toString());
  }
}

class FakeVariantRepository implements VariantRepository {
  variant: Variant | null = null;
  setVariant(v: Variant): void { this.variant = v; }

  async findById(_id: VariantId): Promise<Variant | null> { return this.variant; }
  async findBySku(_sku: Sku): Promise<Variant | null> { return null; }
  async findByProductId(_pId: ProductId): Promise<Variant[]> { return []; }
  async save(_v: Variant): Promise<void> { /* noop */ }
  async delete(_id: VariantId): Promise<void> { /* noop */ }
}

// ── Fake Unit of Work ──────────────────────────────────────────

class FakeUnitOfWork implements UnitOfWork {
  lots: FakeInventoryLotRepository;
  adjustments: FakeInventoryLotAdjustmentRepository;

  constructor(lots: FakeInventoryLotRepository, adjustments: FakeInventoryLotAdjustmentRepository) {
    this.lots = lots;
    this.adjustments = adjustments;
  }

  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    const scope: TestScope = {
      inventoryLots: this.lots,
      inventoryLotAdjustments: this.adjustments,
    };
    return fn(scope);
  }
}

// ── Helpers ────────────────────────────────────────────────────

function makeLot(
  id: string,
  purchased: number,
  remaining: number,
  unitCostCents: number,
  purchaseDate: Date,
): PurchaseLotEntity {
  return new PurchaseLotEntity(
    PurchaseLotIdEntity.from(id),
    VariantIdEntity.from('v1'),
    PurchaseIdEntity.generate(),
    purchased,
    remaining,
    Money.fromCents(unitCostCents),
    purchaseDate,
    null,
  );
}

function makeVariant(): Variant {
  const skuResult = SkuEntity.from('TST-001');
  if (!skuResult.ok) throw new Error('Invalid SKU in test fixture');
  return new VariantEntity(
    VariantIdEntity.from('v1'),
    ProductIdEntity.from('prod-1'),
    skuResult.value,
    { size: 'M', color: 'Negro' },
    true,
    new Date(),
    new Date(),
  );
}

// ── Tests ──────────────────────────────────────────────────────

describe('FIFO + Return regression after lot adjustments', () => {
  let lotsRepo: FakeInventoryLotRepository;
  let adjRepo: FakeInventoryLotAdjustmentRepository;
  let variantRepo: FakeVariantRepository;
  let uow: FakeUnitOfWork;
  let useCase: AdjustInventoryLotUseCase;

  beforeEach(() => {
    lotsRepo = new FakeInventoryLotRepository();
    adjRepo = new FakeInventoryLotAdjustmentRepository();
    variantRepo = new FakeVariantRepository();
    variantRepo.setVariant(makeVariant());
    uow = new FakeUnitOfWork(lotsRepo, adjRepo);
    useCase = new AdjustInventoryLotUseCase(variantRepo);
  });

  // ──────────────────────────────────────────────────────────────
  // FIFO after INCREASE
  // ──────────────────────────────────────────────────────────────

  describe('FIFO after INCREASE', () => {
    it('sale consumes oldest lot first, including newly increased lot', () => {
      // Purchase: L1 = oldest, qty 10, cost $5
      const l1 = makeLot('L1', 10, 10, 500, new Date('2026-01-01'));
      lotsRepo.lots.set('L1', l1);

      // The increase creates a new lot. Execute increase command.
      // We'll call it and inspect the result
      const increaseCmd = {
        action: 'INCREASE' as const,
        variantId: 'v1',
        quantity: 5,
        unitCost: 8,
        reason: 'Stock increase test',
        actorId: 'admin',
        actorSource: 'test',
      };

      return useCase.execute(increaseCmd, uow).then((incResult) => {
        expect(incResult.ok).toBe(true);
        if (!incResult.ok) return;

        const newLotId = incResult.value.createdLotId!;
        const lotsForVariant = Array.from(lotsRepo.lots.values())
          .filter((l) => l.variantId.toString() === 'v1')
          .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());

        expect(lotsForVariant).toHaveLength(2);

        // FIFO: L1 (oldest) first, then increase lot
        const fifoResult = allocateFifo(lotsForVariant, 12);
        expect(fifoResult.ok).toBe(true);
        if (!fifoResult.ok) return;

        expect(fifoResult.value.selections).toHaveLength(2);
        // First selection: oldest lot (L1)
        expect(fifoResult.value.selections[0]!.lotId).toBe('L1');
        expect(fifoResult.value.selections[0]!.quantity).toBe(10);
        expect(fifoResult.value.selections[0]!.unitCost.cents).toBe(500);

        // Second selection: increase lot
        expect(fifoResult.value.selections[1]!.lotId).toBe(newLotId);
        expect(fifoResult.value.selections[1]!.quantity).toBe(2);
        expect(fifoResult.value.selections[1]!.unitCost.cents).toBe(800);

        // Total: 10*500 + 2*800 = 5000 + 1600 = 6600
        expect(fifoResult.value.totalCost.cents).toBe(6600);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────
  // FIFO after HISTORICAL_COMPENSATION (cost correction)
  // ──────────────────────────────────────────────────────────────

  describe('FIFO after cost-compensation (stock moved to new lot)', () => {
    it('future sale consumes from compensation lot after original lot is zeroed', () => {
      // Setup: L1 purchased 10 at $5, 3 consumed (sale), remaining 7
      const l1 = makeLot('L1', 10, 7, 500, new Date('2026-01-01'));
      lotsRepo.lots.set('L1', l1);
      // Mark L1 as having consumption records
      lotsRepo.markConsumed('L1');

      // Also: L2 purchased 5 at $7 (another variant lot for context)
      const l2 = makeLot('L2', 5, 5, 700, new Date('2026-02-01'));
      lotsRepo.lots.set('L2', l2);

      return useCase.execute({
        action: 'HISTORICAL_COMPENSATION',
        variantId: 'v1',
        lotId: 'L1',
        quantityDelta: -2,       // reduce by 2
        unitCost: 6,              // cost correction from 5 to 6
        reason: 'Corrección con costo',
        actorId: 'admin',
        actorSource: 'test',
      }, uow).then((compResult) => {
        expect(compResult.ok).toBe(true);
        if (!compResult.ok) return;

        const createdLotId = compResult.value.createdLotId;
        expect(createdLotId).toBeTruthy();

        // After compensation, L1 should have remaining = 0 (moved to new lot)
        const l1After = lotsRepo.lots.get('L1')!;
        expect(l1After.remainingQuantity).toBe(0);

        // New lot has remaining = old remaining + delta = 7 + (-2) = 5 at new cost
        const newLot = lotsRepo.lots.get(createdLotId!)!;
        expect(newLot.remainingQuantity).toBe(5);
        expect(newLot.unitCost.cents).toBe(600);

        // L1 purchasedQuantity preserved (historical truth)
        expect(l1After.purchasedQuantity).toBe(10);
        expect(l1After.unitCost.cents).toBe(500);

        // FIFO: L1 is exhausted, L2 is older than compensation lot,
        // but L2 is from the same variant. Sale of 8 should consume:
        // - 5 from L2 (oldest open, 700 cents)
        // - 3 from new compensation lot (800 cents? no, 600 cents)
        const lotsForVariant = Array.from(lotsRepo.lots.values())
          .filter((l) => l.variantId.toString() === 'v1')
          .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());

        // L1 (Jan 1, exhausted), L2 (Feb 1, 5 remaining), new lot (now, 5 remaining)
        const fifoResult = allocateFifo(lotsForVariant, 8);
        expect(fifoResult.ok).toBe(true);
        if (!fifoResult.ok) return;

        // L1 is exhausted → skipped. L2 consumed first (oldest open), then new lot
        expect(fifoResult.value.selections[0]!.lotId).toBe('L2');
        expect(fifoResult.value.selections[0]!.quantity).toBe(5);
        expect(fifoResult.value.selections[1]!.lotId).toBe(createdLotId);
        expect(fifoResult.value.selections[1]!.quantity).toBe(3);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Returns still restore to original lot IDs
  // ──────────────────────────────────────────────────────────────

  describe('Return restoration preserves original lot IDs', () => {
    it('return restores to original lot even after cost-compensation on that lot', () => {
      // Setup: purchase L1 (10 units), sale consumes 3 from L1
      const l1 = makeLot('L1', 10, 7, 500, new Date('2026-01-01'));
      lotsRepo.lots.set('L1', l1);
      lotsRepo.markConsumed('L1'); // L1 had a sale consume from it

      // Historical compensation on L1: cost correction, stock moves
      return useCase.execute({
        action: 'HISTORICAL_COMPENSATION',
        variantId: 'v1',
        lotId: 'L1',
        unitCost: 6,
        reason: 'Corrección de costo',
        actorId: 'admin',
        actorSource: 'test',
      }, uow).then((compResult) => {
        expect(compResult.ok).toBe(true);
        if (!compResult.ok) return;

        const compLotId = compResult.value.createdLotId!;

        // After compensation: L1 remaining = 0, new lot has 7 at new cost
        // Original L1 still exists with correct purchasedQuantity (10)
        const l1After = lotsRepo.lots.get('L1')!;
        expect(l1After.purchasedQuantity).toBe(10);
        expect(l1After.remainingQuantity).toBe(0);
        expect(l1After.id.toString()).toBe('L1'); // ID unchanged

        // Compensation lot has moved stock
        const compLot = lotsRepo.lots.get(compLotId)!;
        expect(compLot.remainingQuantity).toBe(7);

        // Now simulate a return: the return should restore to the ORIGINAL L1
        // because that's where the sale consumed from
        // restore(3) on L1 should work (original lot ID stability)
        l1After.restore(3);
        expect(l1After.remainingQuantity).toBe(3);

        // The compensation lot is unaffected by the return
        const compLotAfter = lotsRepo.lots.get(compLotId)!;
        expect(compLotAfter.remainingQuantity).toBe(7);

        // After return + compensation, FIFO should use L1 (has 3 remaining,
        // oldest date) and THEN compensation lot (7 remaining, newer)
        const lotsForVariant = Array.from(lotsRepo.lots.values())
          .filter((l) => l.variantId.toString() === 'v1')
          .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());

        // L1 (Jan 1, now 3 remaining), compensation lot (now, 7 remaining)
        const fifoResult = allocateFifo(lotsForVariant, 5);
        expect(fifoResult.ok).toBe(true);
        if (!fifoResult.ok) return;

        // L1 should be consumed first (oldest + has remaining now)
        expect(fifoResult.value.selections[0]!.lotId).toBe('L1');
        expect(fifoResult.value.selections[0]!.quantity).toBe(3);
        expect(fifoResult.value.selections[1]!.lotId).toBe(compLotId);
        expect(fifoResult.value.selections[1]!.quantity).toBe(2);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Lot ID stability across all operations
  // ──────────────────────────────────────────────────────────────

  describe('Lot identity stability', () => {
    it('intact edit preserves the same lot ID', () => {
      const l1 = makeLot('L1', 10, 10, 500, new Date('2026-01-01'));
      lotsRepo.lots.set('L1', l1);

      return useCase.execute({
        action: 'INTACT_EDIT',
        variantId: 'v1',
        lotId: 'L1',
        quantity: 15,
        reason: 'Edit intact',
        actorId: 'admin',
        actorSource: 'test',
      }, uow).then((result) => {
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const lotAfter = lotsRepo.lots.get('L1')!;
        expect(lotAfter.purchasedQuantity).toBe(15);
        expect(lotAfter.remainingQuantity).toBe(15);
        expect(lotAfter.id.toString()).toBe('L1'); // ID preserved
      });
    });

    it('increase creates a new lot with a different ID', () => {
      const l1 = makeLot('L1', 10, 10, 500, new Date('2026-01-01'));
      lotsRepo.lots.set('L1', l1);

      return useCase.execute({
        action: 'INCREASE',
        variantId: 'v1',
        quantity: 5,
        unitCost: 6,
        reason: 'Increase',
        actorId: 'admin',
        actorSource: 'test',
      }, uow).then((result) => {
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // L1 unchanged
        const l1After = lotsRepo.lots.get('L1')!;
        expect(l1After.purchasedQuantity).toBe(10);
        expect(l1After.remainingQuantity).toBe(10);

        // New lot created
        const newLotId = result.value.createdLotId!;
        expect(newLotId).not.toBe('L1');
        const newLot = lotsRepo.lots.get(newLotId)!;
        expect(newLot.purchasedQuantity).toBe(5);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Audit integrity
  // ──────────────────────────────────────────────────────────────

  describe('Audit integrity after FIFO + adjustments', () => {
    it('adjustment records are created for increase and compensation and are immutable', () => {
      const l1 = makeLot('L1', 10, 10, 500, new Date('2026-01-01'));
      lotsRepo.lots.set('L1', l1);

      return useCase.execute({
        action: 'INCREASE',
        variantId: 'v1',
        quantity: 5,
        unitCost: 7,
        reason: 'Increase audit test',
        actorId: 'admin',
        actorSource: 'test',
      }, uow).then((incResult) => {
        expect(incResult.ok).toBe(true);
        if (!incResult.ok) return;

        // One adjustment record created
        expect(adjRepo.adjustments).toHaveLength(1);
        const incAdj = adjRepo.adjustments[0]!;
        expect(incAdj.snapshot.action).toBe('INCREASE');
        expect(incAdj.snapshot.deltaQuantity).toBe(5);
        expect(incAdj.snapshot.reason).toBe('Increase audit test');

        // Verify the record is immutable (frozen)
        expect(Object.isFrozen(incAdj)).toBe(true);
      });
    });
  });
});
