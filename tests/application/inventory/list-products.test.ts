/**
 * Application tests for ListProductsUseCase — read-only product listing
 * with pagination, search, filters, and deterministic sorting.
 *
 * Verifies:
 * - Default query normalization (page, pageSize, sort, status defaults)
 * - Custom query pass-through with all params
 * - Page/pageSize bounds (min=1, max=100 clamp)
 * - Search trimming and empty-search ignored
 * - Status filter validation (active, inactive, all)
 * - Sort validation (reject unknown sort fields)
 * - Empty result metadata (totalItems=0, totalPages=0)
 * - Read-port pass-through: use case does not alter data or metadata
 */
import { describe, it, expect } from 'vitest';
import { ListProductsUseCase } from '../../../src/modules/inventory/application/use-cases/ListProductsUseCase.js';
import type { ProductListReadRepository } from '../../../src/modules/inventory/domain/ProductListReadRepository.js';
import type {
  ListProductsQuery,
  ListProductsResult,
  ProductListItem,
  ProductVariantSummary,
} from '../../../src/modules/inventory/domain/ProductListReadRepository.js';

// ── Fakes ────────────────────────────────────────────────────

/** Fake read repository that returns whatever was last set via `setNextResult`. */
class FakeProductListReadRepository implements ProductListReadRepository {
  private nextResult: ListProductsResult = { items: [], meta: emptyMeta(1, 20) };
  /** Records the last query received for spy assertions. */
  lastQuery: ListProductsQuery | null = null;

  setNextResult(result: ListProductsResult): void {
    this.nextResult = result;
  }

  async listProducts(query: ListProductsQuery): Promise<ListProductsResult> {
    this.lastQuery = query;
    return this.nextResult;
  }
}

// ── Helpers ──────────────────────────────────────────────────

function emptyMeta(
  page = 1,
  pageSize = 20,
  overrides: Record<string, unknown> = {},
) {
  return {
    page,
    pageSize,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    filters: { status: 'active', search: '' },
    ...overrides,
  };
}

function makeItem(
  productId: string,
  name: string,
  overrides: Partial<ProductListItem> = {},
): ProductListItem {
  return {
    id: productId,
    name,
    description: null,
    baseSku: 'test-sku',
    salePrice: 10.00,
    presalePrice: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    variants: [],
    ...overrides,
  };
}

function makeVariant(
  id: string,
  sku: string,
  overrides: Partial<ProductVariantSummary> = {},
): ProductVariantSummary {
  return { id, sku, attributes: {}, isActive: true, stock: 0, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────

describe('ListProductsUseCase', () => {
  function createUseCase(): {
    useCase: ListProductsUseCase;
    readRepo: FakeProductListReadRepository;
  } {
    const readRepo = new FakeProductListReadRepository();
    const useCase = new ListProductsUseCase(readRepo);
    return { useCase, readRepo };
  }

  // ── Default normalization ─────────────────────────────────

  it('normalizes empty query to defaults', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({});

    expect(readRepo.lastQuery).not.toBeNull();
    expect(readRepo.lastQuery!.page).toBe(1);
    expect(readRepo.lastQuery!.pageSize).toBe(20);
    expect(readRepo.lastQuery!.search).toBe('');
    expect(readRepo.lastQuery!.status).toBe('active');
    expect(readRepo.lastQuery!.sortBy).toBe('createdAt');
    expect(readRepo.lastQuery!.sortOrder).toBe('desc');
  });

  it('passes through a fully specified query', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(2, 10) });

    await useCase.execute({
      page: '2',
      pageSize: '10',
      search: 'shirt',
      status: 'all',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(readRepo.lastQuery!.page).toBe(2);
    expect(readRepo.lastQuery!.pageSize).toBe(10);
    expect(readRepo.lastQuery!.search).toBe('shirt');
    expect(readRepo.lastQuery!.status).toBe('all');
    expect(readRepo.lastQuery!.sortBy).toBe('name');
    expect(readRepo.lastQuery!.sortOrder).toBe('asc');
  });

  // ── Bounds and clamping ───────────────────────────────────

  it('clamps page to minimum 1', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ page: '0' });
    expect(readRepo.lastQuery!.page).toBe(1);

    await useCase.execute({ page: '-5' });
    expect(readRepo.lastQuery!.page).toBe(1);
  });

  it('clamps pageSize between 1 and 100', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 1) });

    await useCase.execute({ pageSize: '0' });
    expect(readRepo.lastQuery!.pageSize).toBe(1);

    await useCase.execute({ pageSize: '200' });
    expect(readRepo.lastQuery!.pageSize).toBe(100);

    await useCase.execute({ pageSize: '101' });
    expect(readRepo.lastQuery!.pageSize).toBe(100);
  });

  // ── Search trimming ───────────────────────────────────────

  it('trims search whitespace', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ search: '  hello  ' });
    expect(readRepo.lastQuery!.search).toBe('hello');
  });

  it('ignores whitespace-only search as empty', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ search: '   ' });
    expect(readRepo.lastQuery!.search).toBe('');
  });

  it('ignores undefined search as empty', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({});
    expect(readRepo.lastQuery!.search).toBe('');
  });

  // ── Status filter ─────────────────────────────────────────

  it('accepts "active" status (default)', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ status: 'active' });
    expect(readRepo.lastQuery!.status).toBe('active');
  });

  it('accepts "inactive" status', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ status: 'inactive' });
    expect(readRepo.lastQuery!.status).toBe('inactive');
  });

  it('accepts "all" status', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ status: 'all' });
    expect(readRepo.lastQuery!.status).toBe('all');
  });

  it('falls back to "active" for unknown status', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ status: 'deleted' });
    expect(readRepo.lastQuery!.status).toBe('active');
  });

  // ── Sort validation ───────────────────────────────────────

  it('accepts valid sort fields', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    for (const field of ['name', 'createdAt', 'updatedAt']) {
      await useCase.execute({ sortBy: field });
      expect(readRepo.lastQuery!.sortBy).toBe(field);
    }
  });

  it('falls back to "createdAt" for unknown sort field', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ sortBy: 'price' });
    expect(readRepo.lastQuery!.sortBy).toBe('createdAt');
  });

  it('rejects unknown sort orders, falls back to "desc"', async () => {
    const { useCase, readRepo } = createUseCase();
    readRepo.setNextResult({ items: [], meta: emptyMeta(1, 20) });

    await useCase.execute({ sortOrder: 'up' });
    expect(readRepo.lastQuery!.sortOrder).toBe('desc');
  });

  // ── Empty result metadata ─────────────────────────────────

  it('returns empty items with zero metadata from read port', async () => {
    const { useCase } = createUseCase();
    // Fake already returns empty data by default
    const result = await useCase.execute({});

    expect(result).toEqual({
      items: [],
      meta: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        filters: { status: 'active', search: '' },
      },
    });
  });

  // ── Read-port pass-through ────────────────────────────────

  it('does not alter data returned by the read port', async () => {
    const { useCase, readRepo } = createUseCase();
    const variantA = makeVariant('var-a', 'SKU-A');
    const item = makeItem('prod-1', 'Test Product', {
      salePrice: 15.00,
      variants: [variantA],
    });
    const expectedResult: ListProductsResult = {
      items: [item],
      meta: {
        page: 3,
        pageSize: 10,
        totalItems: 27,
        totalPages: 3,
        hasNextPage: false,
        hasPreviousPage: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        filters: { status: 'active', search: '' },
      },
    };
    readRepo.setNextResult(expectedResult);

    const result = await useCase.execute({ page: '3', pageSize: '10' });

    expect(result).toEqual(expectedResult);
  });
});
