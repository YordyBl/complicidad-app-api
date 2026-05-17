/**
 * Application tests for AdjustInventoryLotUseCase.
 *
 * Tests the use case with fake repositories. Verifies:
 * - Stock increase creates a new lot + audit record
 * - Intact lot direct edit updates lot in-place
 * - Historical lot direct edit is rejected
 * - Historical quantity decrease reduces remaining
 * - Historical quantity increase creates new compensation lot
 * - Historical cost correction with remaining stock moves units to new lot
 * - Exhausted lot cost correction is audit-only
 * - Validation errors: missing actor, invalid variant/lot, invariants
 * - Transactional integrity: nothing persisted on failure
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
import { NotFoundError, BusinessRuleError } from '../../../src/shared/domain/errors.js';

// ── RED PHASE — import of non-existent module ──────────────────
// This will fail to compile/resolve until we create the use case file.
// That's intentional in strict TDD: the test must fail first.
import { AdjustInventoryLotUseCase } from '../../../src/modules/inventory/application/use-cases/AdjustInventoryLotUseCase.js';
import type { AdjustInventoryLotCommand } from '../../../src/modules/inventory/application/use-cases/AdjustInventoryLotUseCase.js';

// ── Scope type ───────────────────────────────────────────────

interface TestScope extends UnitOfWorkScope {
  inventoryLots: FakeInventoryLotRepository;
  inventoryLotAdjustments: FakeInventoryLotAdjustmentRepository;
}

// ── Fake InventoryLotAdjustmentRepository ────────────────────

class FakeInventoryLotAdjustmentRepository implements InventoryLotAdjustmentRepository {
  adjustments: InventoryLotAdjustment[] = [];

  async save(adjustment: InventoryLotAdjustment): Promise<void> {
    this.adjustments.push(adjustment);
  }

  async findByLotId(lotId: PurchaseLotId): Promise<InventoryLotAdjustment[]> {
    return this.adjustments.filter(
      (a) => a.snapshot.lotId === lotId.toString(),
    );
  }

  async findByVariantId(variantId: VariantId): Promise<InventoryLotAdjustment[]> {
    return this.adjustments.filter(
      (a) => a.snapshot.variantId === variantId.toString(),
    );
  }

  async findById(_id: InventoryLotAdjustmentId): Promise<InventoryLotAdjustment | null> {
    return null;
  }
}

// ── Fake InventoryLotRepository with extended methods ─────────

class FakeInventoryLotRepository implements InventoryLotRepository {
  lots = new Map<string, PurchaseLot>();
  private _consumptionLots = new Set<string>();

  async findById(id: PurchaseLotId): Promise<PurchaseLot | null> {
    return this.lots.get(id.toString()) ?? null;
  }

  async findByIds(ids: PurchaseLotId[]): Promise<PurchaseLot[]> {
    return ids
      .map((id) => this.lots.get(id.toString()))
      .filter((l): l is PurchaseLot => l !== undefined);
  }

  async findByVariantIdOrderedByDate(variantId: VariantId, _lock?: boolean): Promise<PurchaseLot[]> {
    return Array.from(this.lots.values())
      .filter((l) => l.variantId.equals(variantId))
      .sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());
  }

  async save(lot: PurchaseLot): Promise<void> {
    this.lots.set(lot.id.toString(), lot);
  }

  async saveMany(lots: PurchaseLot[]): Promise<void> {
    for (const lot of lots) {
      this.lots.set(lot.id.toString(), lot);
    }
  }

  async delete(id: PurchaseLotId): Promise<void> {
    this.lots.delete(id.toString());
  }

  // ── Extended methods (Slice 2) ────────────────────────────

  async findByIdForUpdate(id: PurchaseLotId): Promise<PurchaseLot | null> {
    return this.lots.get(id.toString()) ?? null;
  }

  async hasConsumptionRecords(lotId: PurchaseLotId): Promise<boolean> {
    return this._consumptionLots.has(lotId.toString());
  }

  markConsumed(lotId: PurchaseLotId): void {
    this._consumptionLots.add(lotId.toString());
  }
}

// ── Fake VariantRepository ───────────────────────────────────

class FakeVariantRepository implements VariantRepository {
  private variants = new Map<string, Variant>();

  setVariant(v: Variant): void {
    this.variants.set(v.id.toString(), v);
  }

  async findById(id: VariantId): Promise<Variant | null> {
    return this.variants.get(id.toString()) ?? null;
  }

  async findBySku(_sku: Sku): Promise<Variant | null> {
    return null;
  }

  async findByProductId(_productId: ProductId): Promise<Variant[]> {
    return [];
  }

  async save(variant: Variant): Promise<void> {
    this.variants.set(variant.id.toString(), variant);
  }

  async delete(_id: VariantId): Promise<void> {
    // no-op
  }
}

// ── Fake UnitOfWork ─────────────────────────────────────────

class FakeUnitOfWork implements UnitOfWork {
  scope: TestScope;

  constructor(scope: TestScope) {
    this.scope = scope;
  }

  async run<T>(fn: (scope: UnitOfWorkScope) => Promise<T>): Promise<T> {
    return fn(this.scope);
  }
}

// ── Fixtures ─────────────────────────────────────────────────

function createTestVariant(skuLabel = 'TEST-VARIANT'): VariantEntity {
  const skuResult = SkuEntity.from(skuLabel);
  if (!skuResult.ok) throw new Error('Invalid SKU');
  return new VariantEntity(
    VariantIdEntity.generate(),
    ProductIdEntity.generate(),
    skuResult.value,
    {},
    true,
    new Date('2025-01-01'),
    new Date('2025-01-01'),
  );
}

function createLot(
  variantId: VariantIdEntity,
  overrides?: { purchased?: number; remaining?: number; unitCost?: number; purchaseDate?: Date },
): PurchaseLot {
  return new PurchaseLotEntity(
    PurchaseLotIdEntity.generate(),
    variantId,
    PurchaseIdEntity.generate(),
    overrides?.purchased ?? 100,
    overrides?.remaining ?? 100,
    Money.fromCents(overrides?.unitCost ?? 1500),
    overrides?.purchaseDate ?? new Date('2025-01-01'),
    null,
  );
}

const VALID_ACTOR = { actorId: 'user-001', actorSource: 'web' };

// ── Shared command builder ───────────────────────────────────

function increaseCmd(overrides?: Partial<AdjustInventoryLotCommand>): AdjustInventoryLotCommand {
  return {
    action: 'INCREASE',
    variantId: '',
    quantity: 50,
    unitCost: 10.00,
    reason: 'Stock entrante',
    actorId: VALID_ACTOR.actorId,
    actorSource: VALID_ACTOR.actorSource,
    ...overrides,
  };
}

function intactEditCmd(
  lotId: string,
  variantId: string,
  overrides?: Partial<AdjustInventoryLotCommand>,
): AdjustInventoryLotCommand {
  return {
    action: 'INTACT_EDIT',
    variantId,
    lotId,
    quantity: 80,
    unitCost: 12.00,
    reason: 'Corrección de stock',
    actorId: VALID_ACTOR.actorId,
    actorSource: VALID_ACTOR.actorSource,
    ...overrides,
  };
}

function historicalCompensationCmd(
  lotId: string,
  variantId: string,
  overrides?: Partial<AdjustInventoryLotCommand>,
): AdjustInventoryLotCommand {
  return {
    action: 'HISTORICAL_COMPENSATION',
    variantId,
    lotId,
    quantityDelta: -10,
    reason: 'Ajuste por merma',
    actorId: VALID_ACTOR.actorId,
    actorSource: VALID_ACTOR.actorSource,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('AdjustInventoryLotUseCase', () => {
  let variantRepo: FakeVariantRepository;
  let lotRepo: FakeInventoryLotRepository;
  let adjustmentRepo: FakeInventoryLotAdjustmentRepository;
  let useCase: AdjustInventoryLotUseCase;
  let variantA: VariantEntity;

  beforeEach(() => {
    variantA = createTestVariant('VARIANT-A');
    variantRepo = new FakeVariantRepository();
    variantRepo.setVariant(variantA);

    lotRepo = new FakeInventoryLotRepository();
    adjustmentRepo = new FakeInventoryLotAdjustmentRepository();

    useCase = new AdjustInventoryLotUseCase(variantRepo);
  });

  function createUow(): FakeUnitOfWork {
    return new FakeUnitOfWork({
      inventoryLots: lotRepo,
      inventoryLotAdjustments: adjustmentRepo,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // INCREASE
  // ═══════════════════════════════════════════════════════════

  describe('INCREASE — stock increase', () => {
    it('creates a new lot with the given quantity and unit cost', async () => {
      const cmd = increaseCmd({ variantId: variantA.id.toString() });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Response includes the created lot id and variant id
      expect(result.value.createdLotId).toBeDefined();
      expect(result.value.variantId).toBe(variantA.id.toString());
      expect(result.value.action).toBe('INCREASE');

      // Lot was persisted
      expect(lotRepo.lots.size).toBe(1);
      const lot = Array.from(lotRepo.lots.values())[0]!;
      expect(lot.variantId.equals(variantA.id)).toBe(true);
      expect(lot.purchasedQuantity).toBe(50);
      expect(lot.remainingQuantity).toBe(50);
      expect(lot.unitCost.cents).toBe(1000); // 10.00 soles

      // Audit record was created
      expect(adjustmentRepo.adjustments).toHaveLength(1);
      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.action).toBe('INCREASE');
      expect(adj.snapshot.variantId).toBe(variantA.id.toString());
      expect(adj.snapshot.deltaQuantity).toBe(50);
      expect(adj.snapshot.reason).toBe('Stock entrante');
    });

    it('accepts zero unit cost (free stock)', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        unitCost: 0,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lot = Array.from(lotRepo.lots.values())[0]!;
      expect(lot.unitCost.cents).toBe(0);
    });

    it('accepts an effectiveAt timestamp', async () => {
      const effectiveAt = '2025-06-15T00:00:00.000Z';
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        effectiveAt,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lot = Array.from(lotRepo.lots.values())[0]!;
      expect(lot.purchaseDate.toISOString()).toBe(effectiveAt);
    });

    it('stores correlationId in the audit record when provided', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        correlationId: 'corr-123',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.correlationId).toBe('corr-123');
    });
  });

  describe('INCREASE — validation', () => {
    it('rejects unknown variant', async () => {
      const cmd = increaseCmd({ variantId: 'non-existent' });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(lotRepo.lots.size).toBe(0);
    });

    it('rejects non-integer quantity', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        quantity: 1.5,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });

    it('rejects zero quantity', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        quantity: 0,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });

    it('rejects negative quantity', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        quantity: -5,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });

    it('rejects negative unit cost', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        unitCost: -1.00,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });

    it('rejects empty reason', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        reason: '',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });

    it('rejects missing actor identity', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        actorId: '',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });

    it('rejects invalid effectiveAt date', async () => {
      const cmd = increaseCmd({
        variantId: variantA.id.toString(),
        effectiveAt: 'not-a-date',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // INTACT_EDIT
  // ═══════════════════════════════════════════════════════════

  describe('INTACT_EDIT — direct edit of intact lot', () => {
    it('updates quantity and unit cost on intact lot in place', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 100, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = intactEditCmd(lot.id.toString(), variantA.id.toString(), {
        quantity: 80,
        unitCost: 12.00,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Lot updated in place
      const updated = lotRepo.lots.get(lot.id.toString())!;
      expect(updated.purchasedQuantity).toBe(80);
      expect(updated.remainingQuantity).toBe(80);
      expect(updated.unitCost.cents).toBe(1200);

      // Only one lot still
      expect(lotRepo.lots.size).toBe(1);

      // Audit record with before/after
      expect(adjustmentRepo.adjustments).toHaveLength(1);
      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.action).toBe('INTACT_EDIT');
      expect(adj.snapshot.beforeQuantity).toBe(100);
      expect(adj.snapshot.afterQuantity).toBe(80);
      expect(adj.snapshot.beforeUnitCostCents).toBe(1500);
      expect(adj.snapshot.afterUnitCostCents).toBe(1200);
    });

    it('updates only quantity when unitCost is not provided', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 100, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = intactEditCmd(lot.id.toString(), variantA.id.toString(), {
        quantity: 60,
        unitCost: undefined,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const updated = lotRepo.lots.get(lot.id.toString())!;
      expect(updated.purchasedQuantity).toBe(60);
      expect(updated.unitCost.cents).toBe(1500); // unchanged

      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.beforeUnitCostCents).toBe(1500);
      expect(adj.snapshot.afterUnitCostCents).toBe(1500);
    });

    it('updates only unitCost when quantity is not provided', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 100, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = intactEditCmd(lot.id.toString(), variantA.id.toString(), {
        quantity: undefined,
        unitCost: 20.00,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const updated = lotRepo.lots.get(lot.id.toString())!;
      expect(updated.purchasedQuantity).toBe(100); // unchanged
      expect(updated.unitCost.cents).toBe(2000);

      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.beforeQuantity).toBe(100);
      expect(adj.snapshot.afterQuantity).toBe(100);
    });

    it('rejects edit when consumption records exist', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 100, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);
      lotRepo.markConsumed(lot.id);

      const cmd = intactEditCmd(lot.id.toString(), variantA.id.toString(), {
        quantity: 80,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('histórico');
    });

    it('rejects edit when prior adjustments exist', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 100, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      // Add a prior adjustment referencing this lot
      const { InventoryLotAdjustment } = await import(
        '../../../src/modules/inventory/domain/InventoryLotAdjustment.js'
      );
      const priorAdj = InventoryLotAdjustment.create({
        variantId: variantA.id.toString(),
        lotId: lot.id.toString(),
        action: 'INTACT_EDIT',
        beforeQuantity: 150,
        afterQuantity: 100,
        beforeUnitCostCents: 1500,
        afterUnitCostCents: 1500,
        deltaQuantity: -50,
        reason: 'Previous correction',
        actorId: 'user-001',
        actorSource: 'web',
        requestedAt: new Date(),
        effectiveAt: new Date(),
        correlationId: null,
      });
      adjustmentRepo.adjustments.push(priorAdj);

      const cmd = intactEditCmd(lot.id.toString(), variantA.id.toString(), {
        quantity: 80,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('histórico');
    });

    it('rejects edit on partially consumed lot', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 50, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = intactEditCmd(lot.id.toString(), variantA.id.toString(), {
        quantity: 80,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });

    it('rejects unknown lot', async () => {
      const cmd = intactEditCmd('non-existent-lot', variantA.id.toString());

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  describe('INTACT_EDIT — validation', () => {
    it('rejects when no lotId provided', async () => {
      const cmd = intactEditCmd('', variantA.id.toString());

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // HISTORICAL_COMPENSATION
  // ═══════════════════════════════════════════════════════════

  describe('HISTORICAL_COMPENSATION — quantity decrease', () => {
    it('decrements remaining quantity and records adjustment', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 80, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: -30,
        reason: 'Merma detectada',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const updatedLot = lotRepo.lots.get(lot.id.toString())!;
      expect(updatedLot.remainingQuantity).toBe(50);
      expect(updatedLot.purchasedQuantity).toBe(100); // unchanged

      expect(adjustmentRepo.adjustments).toHaveLength(1);
      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.action).toBe('HISTORICAL_COMPENSATION');
      expect(adj.snapshot.deltaQuantity).toBe(-30);
      expect(adj.snapshot.beforeQuantity).toBe(80);
      expect(adj.snapshot.afterQuantity).toBe(50);
    });

    it('rejects decrease that would make remaining negative', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 10, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: -20,
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
      expect(result.error.message).toContain('restante');
    });
  });

  describe('HISTORICAL_COMPENSATION — quantity increase', () => {
    it('creates a new compensation lot with the delta quantity', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 50, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: 30,
        reason: 'Ajuste por hallazgo',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Original lot unchanged
      const original = lotRepo.lots.get(lot.id.toString())!;
      expect(original.remainingQuantity).toBe(50);
      expect(original.purchasedQuantity).toBe(100);

      // New compensation lot created
      expect(lotRepo.lots.size).toBe(2);
      expect(result.value.createdLotId).toBeDefined();
      expect(result.value.createdLotId).not.toBe(lot.id.toString());

      const newLot = lotRepo.lots.get(result.value.createdLotId!)!;
      expect(newLot.purchasedQuantity).toBe(30);
      expect(newLot.remainingQuantity).toBe(30);

      // Audit record references both
      expect(adjustmentRepo.adjustments).toHaveLength(1);
      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.action).toBe('HISTORICAL_COMPENSATION');
      expect(adj.snapshot.deltaQuantity).toBe(30);
    });
  });

  describe('HISTORICAL_COMPENSATION — cost correction with remaining stock', () => {
    it('moves remaining units into a new lot with corrected cost and zeros old lot', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 60, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: undefined,
        unitCost: 25.00,
        reason: 'Corrección de costo',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Old lot: remaining zeroed, purchased unchanged
      const oldLot = lotRepo.lots.get(lot.id.toString())!;
      expect(oldLot.remainingQuantity).toBe(0);
      expect(oldLot.purchasedQuantity).toBe(100);
      expect(oldLot.unitCost.cents).toBe(1500); // cost unchanged

      // New compensation lot: 60 units at new cost
      expect(lotRepo.lots.size).toBe(2);
      const newLot = Array.from(lotRepo.lots.values()).find(
        (l) => l.id.toString() !== lot.id.toString(),
      )!;
      expect(newLot.purchasedQuantity).toBe(60);
      expect(newLot.remainingQuantity).toBe(60);
      expect(newLot.unitCost.cents).toBe(2500);

      // Audit record
      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.action).toBe('HISTORICAL_COMPENSATION');
      expect(adj.snapshot.beforeUnitCostCents).toBe(1500);
      expect(adj.snapshot.afterUnitCostCents).toBe(2500);
    });

    it('also applies quantity delta alongside cost correction', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 60, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: -10,
        unitCost: 25.00,
        reason: 'Corrección de costo y merma',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Old lot remaining zeroed (stock moved to new lot)
      const oldLot = lotRepo.lots.get(lot.id.toString())!;
      expect(oldLot.remainingQuantity).toBe(0);
      expect(oldLot.purchasedQuantity).toBe(100); // kept

      // New lot = remaining after delta (60 - 10 = 50) at new cost
      const newLot = Array.from(lotRepo.lots.values()).find(
        (l) => l.id.toString() !== lot.id.toString(),
      )!;
      expect(newLot.purchasedQuantity).toBe(50);
      expect(newLot.remainingQuantity).toBe(50);
      expect(newLot.unitCost.cents).toBe(2500);

      // Audit record captures the delta on target lot
      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.deltaQuantity).toBe(-60); // all 60 units moved out
      expect(adj.snapshot.beforeUnitCostCents).toBe(1500);
      expect(adj.snapshot.afterUnitCostCents).toBe(2500);
    });
  });

  describe('HISTORICAL_COMPENSATION — exhausted lot cost correction', () => {
    it('creates audit-only record without mutating stock', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 0, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: undefined,
        unitCost: 20.00,
        reason: 'Corrección de costo histórico',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Lot unchanged
      const unchanged = lotRepo.lots.get(lot.id.toString())!;
      expect(unchanged.remainingQuantity).toBe(0);
      expect(unchanged.unitCost.cents).toBe(1500);

      // No new lot created
      expect(result.value.createdLotId).toBeNull();

      // Audit record only
      expect(adjustmentRepo.adjustments).toHaveLength(1);
      const adj = adjustmentRepo.adjustments[0]!;
      expect(adj.snapshot.action).toBe('HISTORICAL_COMPENSATION');
    });
  });

  describe('HISTORICAL_COMPENSATION — validation', () => {
    it('rejects when neither quantityDelta nor unitCost is provided', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 50, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: undefined,
        unitCost: undefined,
        reason: 'Sin cambios',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(BusinessRuleError);
    });

    it('rejects unknown lot', async () => {
      const cmd = historicalCompensationCmd('bad-id', variantA.id.toString());

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(NotFoundError);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // HISTORICAL_COMPENSATION — variantId derivation (Fix #1)
  // ═══════════════════════════════════════════════════════════

  describe('HISTORICAL_COMPENSATION — variantId contract', () => {
    it('succeeds when variantId is omitted (derived from lot)', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 50, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        variantId: undefined,
        quantityDelta: -10,
        reason: 'Sin variantId en el body',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The derived variantId must be the one from the lot
      expect(result.value.variantId).toBe(variantA.id.toString());
    });

    it('succeeds when variantId is an empty string (derived from lot)', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 50, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        variantId: '',
        quantityDelta: -10,
        reason: 'variantId vacío en el body',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.variantId).toBe(variantA.id.toString());
    });
  });

  // ═══════════════════════════════════════════════════════════
  // HISTORICAL_COMPENSATION — immutability invariant (Fix #2)
  // ═══════════════════════════════════════════════════════════

  describe('HISTORICAL_COMPENSATION — historical immutability', () => {
    it('preserves purchasedQuantity after quantity decrease', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 80, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: -30,
        reason: 'Merma',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const original = lotRepo.lots.get(lot.id.toString())!;
      expect(original.purchasedQuantity).toBe(100); // historical truth preserved
      expect(original.unitCost.cents).toBe(1500);    // historical truth preserved
      expect(original.purchaseDate.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('preserves purchasedQuantity and unitCost after cost correction with remaining stock', async () => {
      const purchaseDate = new Date('2025-03-15T00:00:00.000Z');
      const lot = createLot(variantA.id, { purchased: 100, remaining: 60, unitCost: 1500, purchaseDate });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: undefined,
        unitCost: 25.00,
        reason: 'Corrección de costo',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const original = lotRepo.lots.get(lot.id.toString())!;
      // Historical truth fields MUST NOT be mutated by cost correction
      expect(original.purchasedQuantity).toBe(100);
      expect(original.unitCost.cents).toBe(1500);
      expect(original.purchaseDate.toISOString()).toBe('2025-03-15T00:00:00.000Z');
      expect(original.purchaseId.toString()).toBe(lot.purchaseId.toString());
    });

    it('preserves historical truth after quantity increase compensation', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 50, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: 30,
        reason: 'Ajuste por hallazgo',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const original = lotRepo.lots.get(lot.id.toString())!;
      // All historical truth fields preserved
      expect(original.purchasedQuantity).toBe(100);
      expect(original.remainingQuantity).toBe(50);
      expect(original.unitCost.cents).toBe(1500);
      expect(original.purchaseDate.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('preserves all historical fields after exhausted lot cost correction (audit-only)', async () => {
      const lot = createLot(variantA.id, { purchased: 100, remaining: 0, unitCost: 1500 });
      lotRepo.lots.set(lot.id.toString(), lot);

      const cmd = historicalCompensationCmd(lot.id.toString(), variantA.id.toString(), {
        quantityDelta: undefined,
        unitCost: 20.00,
        reason: 'Costo histórico',
      });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const original = lotRepo.lots.get(lot.id.toString())!;
      expect(original.purchasedQuantity).toBe(100);
      expect(original.remainingQuantity).toBe(0);
      expect(original.unitCost.cents).toBe(1500);
      expect(original.purchaseDate.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TRANSACTIONAL INTEGRITY
  // ═══════════════════════════════════════════════════════════

  describe('transactional integrity', () => {
    it('persists nothing when validation fails', async () => {
      const cmd = increaseCmd({ variantId: 'non-existent' });

      const result = await useCase.execute(cmd, createUow());

      expect(result.ok).toBe(false);
      expect(lotRepo.lots.size).toBe(0);
      expect(adjustmentRepo.adjustments).toHaveLength(0);
    });
  });
});
