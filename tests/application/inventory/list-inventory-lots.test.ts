/**
 * Application tests for ListInventoryLotsUseCase.
 *
 * Verifies:
 * - Passes filters to the read repository
 * - Returns the repository's result unmodified
 * - Propagates errors from the repository
 */
import { describe, it, expect } from 'vitest';
import {
  ListInventoryLotsUseCase,
} from '../../../src/modules/inventory/application/use-cases/ListInventoryLotsUseCase.js';
import type {
  InventoryLotReadRepository,
  InventoryLotsResponse,
} from '../../../src/modules/inventory/application/use-cases/ListInventoryLotsUseCase.js';
import type { Result } from '../../../src/shared/domain/Result.js';
import { ok, err } from '../../../src/shared/domain/Result.js';
import { NotFoundError } from '../../../src/shared/domain/errors.js';

// ── Fake read repository ────────────────────────────────────

class FakeInventoryLotReadRepository implements InventoryLotReadRepository {
  private nextResult: Result<InventoryLotsResponse> = ok({
    product: null,
    variants: [],
  });

  lastFilters: { productId?: string; variantId?: string } | null = null;

  setNextResult(result: Result<InventoryLotsResponse>): void {
    this.nextResult = result;
  }

  async listLots(
    filters: { productId?: string; variantId?: string },
  ): Promise<Result<InventoryLotsResponse>> {
    this.lastFilters = filters;
    return this.nextResult;
  }
}

// ── Helpers ─────────────────────────────────────────────────

function makeLotsResponse(
  overrides: Partial<InventoryLotsResponse> = {},
): InventoryLotsResponse {
  return {
    product: { id: 'prod-1', name: 'Zapatillas' },
    variants: [
      {
        variantId: 'var-1',
        sku: 'ZAP-38',
        attributes: { size: '38' },
        stock: 10,
        lots: [
          {
            lotId: 'lot-1',
            variantId: 'var-1',
            productId: 'prod-1',
            productName: 'Zapatillas',
            sku: 'ZAP-38',
            attributes: { size: '38' },
            purchasedQuantity: 10,
            remainingQuantity: 10,
            unitCost: 50,
            purchaseDate: '2026-05-01T00:00:00.000Z',
            state: 'INTACT',
            allowedAction: 'edit',
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('ListInventoryLotsUseCase', () => {
  function createUseCase(): {
    useCase: ListInventoryLotsUseCase;
    readRepo: FakeInventoryLotReadRepository;
  } {
    const readRepo = new FakeInventoryLotReadRepository();
    const useCase = new ListInventoryLotsUseCase(readRepo);
    return { useCase, readRepo };
  }

  // ── Happy path ────────────────────────────────────────────

  it('passes empty filters to repository and returns its result', async () => {
    const { useCase, readRepo } = createUseCase();
    const expected = makeLotsResponse();
    readRepo.setNextResult(ok(expected));

    const result = await useCase.execute({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(expected);
    }
    expect(readRepo.lastFilters).toEqual({});
  });

  it('passes productId filter to repository', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult(ok(makeLotsResponse()));

    await useCase.execute({ productId: 'prod-001' });

    expect(readRepo.lastFilters).toEqual({ productId: 'prod-001' });
  });

  it('passes variantId filter to repository', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult(ok(makeLotsResponse()));

    await useCase.execute({ variantId: 'var-002' });

    expect(readRepo.lastFilters).toEqual({ variantId: 'var-002' });
  });

  it('passes both filters to repository', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult(ok(makeLotsResponse()));

    await useCase.execute({ productId: 'prod-001', variantId: 'var-002' });

    expect(readRepo.lastFilters).toEqual({
      productId: 'prod-001',
      variantId: 'var-002',
    });
  });

  // ── Error propagation ─────────────────────────────────────

  it('propagates NotFoundError from repository', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult(err(new NotFoundError('Product', 'prod-unknown')));

    const result = await useCase.execute({ productId: 'prod-unknown' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.name).toBe('NotFoundError');
      expect(result.error.message).toContain('prod-unknown');
    }
  });

  it('propagates generic errors from repository', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult(err({ name: 'SomeError', message: 'Algo salió mal' }));

    const result = await useCase.execute({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Algo salió mal');
    }
  });

  // ── Empty response ────────────────────────────────────────

  it('returns empty variants when repository returns empty list', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult(ok({ product: null, variants: [] }));

    const result = await useCase.execute({});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.variants).toEqual([]);
      expect(result.value.product).toBeNull();
    }
  });
});
