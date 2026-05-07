/**
 * Application tests for GetProductByIdUseCase — read-only product detail lookup.
 *
 * Verifies:
 * - Returns ProductListItem when repository finds the product
 * - Returns null when repository returns null
 * - Passes the correct ID to the repository
 */
import { describe, it, expect } from 'vitest';
import { GetProductByIdUseCase } from '../../../src/modules/inventory/application/use-cases/GetProductByIdUseCase.js';
import type { ProductListReadRepository, ProductListItem } from '../../../src/modules/inventory/domain/ProductListReadRepository.js';

// ── Fakes ────────────────────────────────────────────────────

class FakeProductListReadRepository implements ProductListReadRepository {
  private nextResult: ProductListItem | null = null;
  lastId: string | null = null;

  setNextResult(result: ProductListItem | null): void {
    this.nextResult = result;
  }

  async listProducts(): Promise<never> {
    throw new Error('Not used in this test');
  }

  async getProductById(id: string): Promise<ProductListItem | null> {
    this.lastId = id;
    return this.nextResult;
  }
}

// ── Helpers ──────────────────────────────────────────────────

function makeProductDetail(overrides: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id: 'prod-1',
    name: 'Remera Classic',
    description: 'Remera de algodón premium',
    baseSku: 'remera-classic',
    salePrice: 250,
    presalePrice: 450,
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    variants: [
      {
        id: 'var-1',
        sku: 'REM-CLA-M',
        attributes: { size: 'M', color: 'Negro' },
        isActive: true,
        stock: 15,
      },
    ],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('GetProductByIdUseCase', () => {
  function createUseCase(): {
    useCase: GetProductByIdUseCase;
    readRepo: FakeProductListReadRepository;
  } {
    const readRepo = new FakeProductListReadRepository();
    const useCase = new GetProductByIdUseCase(readRepo);
    return { useCase, readRepo };
  }

  // ── Happy path ────────────────────────────────────────────

  it('returns product detail when repository finds the product', async () => {
    const { useCase, readRepo } = createUseCase();
    const expected = makeProductDetail();
    readRepo.setNextResult(expected);

    const result = await useCase.execute('prod-1');

    expect(result).toEqual(expected);
    expect(readRepo.lastId).toBe('prod-1');
  });

  // ── Not found ─────────────────────────────────────────────

  it('returns null when repository returns null', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult(null);

    const result = await useCase.execute('non-existent-id');

    expect(result).toBeNull();
    expect(readRepo.lastId).toBe('non-existent-id');
  });

  // ── Edge: empty string ID ─────────────────────────────────

  it('passes empty string ID to repository without crashing', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult(null);

    const result = await useCase.execute('');

    expect(result).toBeNull();
    expect(readRepo.lastId).toBe('');
  });
});
