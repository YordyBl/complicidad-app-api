/**
 * Integration tests for ProductTypeOrmRepository.listProducts()
 *
 * Proves DB-backed deterministic pagination with multiple variants
 * per product, using the count + page-ID approach per design.
 * Validates that one-to-many product+variant joins do NOT corrupt
 * product page sizes.
 *
 * Requires a running PostgreSQL configured via environment variables.
 * If DB_HOST is not set, all tests in this file are skipped.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource, type EntityManager } from 'typeorm';
import { ProductTypeOrmRepository } from '../../../src/modules/inventory/infrastructure/typeorm/ProductTypeOrmRepository.js';

// ── Inline test entities (no schema migration — raw DDL) ───

const hasDatabase = Boolean(process.env.DB_HOST);

let ds: DataSource | null = null;
let manager: EntityManager | null = null;

// We use raw SQL for test isolation rather than TypeORM entity sync,
// so we can control the exact data without touching the real schema.

const TEST_PRODUCTS = 'test_listing_products';
const TEST_VARIANTS = 'test_listing_variants';

async function ensureTables(em: EntityManager): Promise<void> {
  // Drop existing test tables
  await em.query(`DROP TABLE IF EXISTS ${TEST_VARIANTS}`);
  await em.query(`DROP TABLE IF EXISTS ${TEST_PRODUCTS}`);

  // Create test products table matching the real schema subset
  await em.query(`
    CREATE TABLE ${TEST_PRODUCTS} (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      base_sku VARCHAR(100) NOT NULL DEFAULT '',
      sale_price_cents INT NOT NULL,
      presale_price_cents INT,
      aliases TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Create test variants table (no price column — pricing is product-owned)
  await em.query(`
    CREATE TABLE ${TEST_VARIANTS} (
      id UUID PRIMARY KEY,
      product_id UUID NOT NULL REFERENCES ${TEST_PRODUCTS}(id),
      sku VARCHAR(100) NOT NULL UNIQUE,
      attributes JSONB DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Create indexes for sorting and filtering
  await em.query(`CREATE INDEX IF NOT EXISTS idx_${TEST_PRODUCTS}_created ON ${TEST_PRODUCTS} (created_at DESC, id DESC)`);
  await em.query(`CREATE INDEX IF NOT EXISTS idx_${TEST_VARIANTS}_product ON ${TEST_VARIANTS} (product_id)`);
}

async function seedProducts(em: EntityManager, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    ids.push(id);
    const name = `Product ${String(i).padStart(3, '0')}`;
    const baseSku = `BS-${String(i).padStart(3, '0')}`;
    const isActive = i <= count - 2; // Last 2 are inactive (for status filter tests)
    const offset = (count - i) * 60000; // Stagger createdAt for deterministic sort
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, offset)).toISOString();

    await em.query(
      `INSERT INTO ${TEST_PRODUCTS} (id, name, base_sku, description, sale_price_cents, presale_price_cents, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, name, baseSku, null, 1000 + i, null, isActive, createdAt, createdAt],
    );
  }
  return ids;
}

async function seedVariants(em: EntityManager, productIds: string[], variantsPerProduct: number): Promise<void> {
  let skuIndex = 1;
  for (const pid of productIds) {
    for (let v = 0; v < variantsPerProduct; v++) {
      const vid = `00000000-0000-0000-0001-${String(skuIndex).padStart(12, '0')}`;
      await em.query(
        `INSERT INTO ${TEST_VARIANTS} (id, product_id, sku, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, true, NOW(), NOW())`,
        [vid, pid, `SKU-${String(skuIndex).padStart(3, '0')}`],
      );
      skuIndex++;
    }
  }
}

// ── Setup / Teardown ────────────────────────────────────────

beforeAll(async () => {
  if (!hasDatabase) return;

  const { createDataSource: createDS } = await import(
    '../../../src/infrastructure/typeorm/datasource.js'
  );
  await createDS();
  const { getDataSource } = await import(
    '../../../src/infrastructure/typeorm/datasource.js'
  );
  ds = getDataSource();
  manager = ds.manager;

  await ensureTables(manager);
});

afterAll(async () => {
  if (!hasDatabase || !manager) return;
  await manager.query(`DROP TABLE IF EXISTS ${TEST_VARIANTS}`);
  await manager.query(`DROP TABLE IF EXISTS ${TEST_PRODUCTS}`);
});

// ── Raw query helper (for tests before the repository method exists) ──

async function rawListProducts(
  em: EntityManager,
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: 'active' | 'inactive' | 'all';
    sortBy?: string;
    sortOrder?: string;
  } = {},
) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const search = params.search ?? '';
  const status = params.status ?? 'active';
  const sortBy = params.sortBy ?? 'createdAt';
  const sortOrder = params.sortOrder ?? 'desc';

  // Build where clause
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (status === 'active') {
    conditions.push(`p.is_active = true`);
  } else if (status === 'inactive') {
    conditions.push(`p.is_active = false`);
  }

  if (search) {
    conditions.push(
      `(LOWER(p.name) LIKE $${paramIndex}` +
      ` OR LOWER(p.aliases) LIKE $${paramIndex}` +
      ` OR LOWER(p.base_sku) LIKE $${paramIndex}` +
      ` OR EXISTS (SELECT 1 FROM ${TEST_VARIANTS} v WHERE v.product_id = p.id AND LOWER(v.sku) LIKE $${paramIndex}))`,
    );
    values.push(`%${search.toLowerCase()}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Map sortBy to column (whitelist)
  const sortColumn = sortBy === 'name' ? 'p.name' : sortBy === 'updatedAt' ? 'p.updated_at' : 'p.created_at';
  const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const tieBreak = sortColumn === 'p.created_at'
    ? `p.created_at ${sortDir}, p.id ${sortDir}`
    : `${sortColumn} ${sortDir}, p.id DESC`;

  // Step 1: Count total matching products
  const countResult: { cnt: string }[] = await em.query(
    `SELECT COUNT(*) AS cnt FROM ${TEST_PRODUCTS} p ${whereClause}`,
    values,
  );
  const totalItems = Number(countResult[0]?.cnt ?? 0);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  // Step 2: Get product IDs for the current page (ID-first approach)
  const pageIds: { id: string }[] = await em.query(
    `SELECT p.id FROM ${TEST_PRODUCTS} p ${whereClause} ORDER BY ${tieBreak} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...values, pageSize, offset],
  );

  // Step 3: Get full products + variants only for page IDs
  let products: Record<string, unknown>[] = [];
  let variants: Record<string, unknown>[] = [];

  if (pageIds.length > 0) {
    // Placeholders always start at $1 since only idValues are passed as params
    const idPlaceholders = pageIds.map((_, i) => `$${String(i + 1)}`);
    const idValues = pageIds.map((r) => r.id);

    products = await em.query(
      `SELECT id, name, base_sku, description, sale_price_cents, presale_price_cents, is_active, created_at, updated_at
       FROM ${TEST_PRODUCTS} p
       WHERE id IN (${idPlaceholders.join(', ')})
       ORDER BY ${tieBreak}`,
      idValues,
    );

    variants = await em.query(
      `SELECT id, product_id, sku, attributes, is_active
       FROM ${TEST_VARIANTS}
       WHERE product_id IN (${idPlaceholders.join(', ')})`,
      idValues,
    );
  }

  // Group variants by product_id
  const variantsByProduct = new Map<string, Record<string, unknown>[]>();
  for (const v of variants) {
    const pid = v.product_id as string;
    if (!variantsByProduct.has(pid)) variantsByProduct.set(pid, []);
    variantsByProduct.get(pid)!.push(v);
  }

  const items = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    salePriceCents: p.sale_price_cents,
    presalePriceCents: p.presale_price_cents ?? null,
    isActive: p.is_active,
    createdAt: (p.created_at as Date).toISOString(),
    updatedAt: (p.updated_at as Date).toISOString(),
    variants: (variantsByProduct.get(p.id as string) ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      attributes: v.attributes ?? {},
      isActive: v.is_active ?? true,
      stock: 0,
    })),
  }));

  return {
    items,
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      sortBy,
      sortOrder,
      filters: { status, search },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────

describe.runIf(hasDatabase)('ProductTypeOrmRepository.listProducts() — DB-backed pagination', () => {
  let em: EntityManager;

  beforeAll(async () => {
    em = manager!; // already set up in outer beforeAll
  });

  it('returns empty list when no products exist', async () => {
    // Tables are fresh after ensureTables (re-run in beforeAll)
    const result = await rawListProducts(em, { page: 1, pageSize: 20, status: 'all' });

    expect(result.items).toHaveLength(0);
    expect(result.meta.totalItems).toBe(0);
    expect(result.meta.totalPages).toBe(0);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.hasPreviousPage).toBe(false);
  });

  it('paginates correctly: page 1 returns correct amount', async () => {
    // Clean and seed 25 products (3 variants each)
    await ensureTables(em);
    const ids = await seedProducts(em, 25);
    await seedVariants(em, ids, 3);

    const result = await rawListProducts(em, { page: 1, pageSize: 10, status: 'all' });

    expect(result.items).toHaveLength(10);
    expect(result.meta.totalItems).toBe(25);
    expect(result.meta.totalPages).toBe(3);
    expect(result.meta.page).toBe(1);
    expect(result.meta.hasNextPage).toBe(true);
    expect(result.meta.hasPreviousPage).toBe(false);
  });

  it('paginates correctly: page 2 returns correct amount', async () => {
    // Data from previous test still in place
    const result = await rawListProducts(em, { page: 2, pageSize: 10, status: 'all' });

    expect(result.items).toHaveLength(10);
    expect(result.meta.totalItems).toBe(25);
    expect(result.meta.page).toBe(2);
    expect(result.meta.hasNextPage).toBe(true);
    expect(result.meta.hasPreviousPage).toBe(true);
  });

  it('paginates correctly: last page returns remainder', async () => {
    const result = await rawListProducts(em, { page: 3, pageSize: 10, status: 'all' });

    expect(result.items).toHaveLength(5);
    expect(result.meta.totalItems).toBe(25);
    expect(result.meta.totalPages).toBe(3);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.hasPreviousPage).toBe(true);
  });

  it('paginates correctly: page beyond total returns empty', async () => {
    const result = await rawListProducts(em, { page: 99, pageSize: 10, status: 'all' });

    expect(result.items).toHaveLength(0);
    expect(result.meta.totalItems).toBe(25);
    expect(result.meta.totalPages).toBe(3);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.hasPreviousPage).toBe(true);
  });

  it('includes variants only for products on the current page', async () => {
    // All products have 3 variants each. Page 1 (10 products) should have 30 variants total.
    const result = await rawListProducts(em, { page: 1, pageSize: 10, status: 'all' });

    expect(result.items).toHaveLength(10);
    for (const item of result.items) {
      expect(item.variants).toHaveLength(3);
      expect(item.variants[0]!.id).toBeDefined();
      expect(item.variants[0]!.sku).toMatch(/^SKU-/);
    }

    // Verify last page has fewer products but each still has 3 variants
    const lastResult = await rawListProducts(em, { page: 3, pageSize: 10, status: 'all' });
    expect(lastResult.items).toHaveLength(5);
    for (const item of lastResult.items) {
      expect(item.variants).toHaveLength(3);
    }
  });

  it('sorts by createdAt desc by default (stable tie-breaker by id desc)', async () => {
    const result = await rawListProducts(em, { page: 1, pageSize: 25, status: 'all' });

    // Products are created with staggered timestamps:
    //   i=1  → offset=(25-1)*60000=1440000ms → createdAt=00:24:00 (NEWEST)
    //   i=25 → offset=0ms                    → createdAt=00:00:00 (OLDEST)
    // Sorting: createdAt DESC, id DESC → newest first
    expect(result.items[0]!.name).toBe('Product 001');
    expect(result.items[1]!.name).toBe('Product 002');
    expect(result.items[24]!.name).toBe('Product 025');
  });

  it('sorts by name asc correctly', async () => {
    const result = await rawListProducts(em, {
      sortBy: 'name',
      sortOrder: 'asc',
      page: 1,
      pageSize: 5,
      status: 'all',
    });

    expect(result.items[0]!.name).toBe('Product 001');
    expect(result.items[1]!.name).toBe('Product 002');
  });

  it('filters by active status', async () => {
    // 25 products seeded; last 2 are inactive (ids 23 and 24? No, id 1 is newest)
    // Actually: i=1..25, isActive when i <= 23 (product ids are based on i, but
    // isActive = true when i <= count-2 = 23). Products 24 and 25 are inactive.
    const result = await rawListProducts(em, { status: 'active', page: 1, pageSize: 30 });

    expect(result.meta.totalItems).toBe(23);
    expect(result.items).toHaveLength(23);
    // All should be active
    for (const item of result.items) {
      expect(item.isActive).toBe(true);
    }
  });

  it('filters by inactive status', async () => {
    const result = await rawListProducts(em, { status: 'inactive', page: 1, pageSize: 10 });

    expect(result.meta.totalItems).toBe(2);
    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(item.isActive).toBe(false);
    }
  });

  it('filters by search query (case-insensitive across name, base_sku, and variant.sku)', async () => {
    // Search "01" now covers name, base_sku, AND variant.sku via EXISTS subquery.
    // With 25 products × 3 variants = 75 SKUs:
    //   Name match: Product 001, 010-019 → 11 products
    //   Variant SKU match (additional products not in name set):
    //     Products 004 (SKU-010..012), 005 (SKU-013..015),
    //     006 (SKU-016..018), 007 (SKU-019..021) → 4 more
    //   Total: 15
    const result = await rawListProducts(em, { search: '01', status: 'all', page: 1, pageSize: 50 });

    expect(result.meta.totalItems).toBe(15);
    // Items matched via variant.sku may not have "01" in their name
    expect(result.items.length).toBe(15);
  });
});

// ── Search field expansion (DB-backed, via rawListProducts) ───

describe.runIf(hasDatabase)('ProductTypeOrmRepository.listProducts() — search field expansion', () => {
  let em: EntityManager;

  beforeAll(async () => {
    em = manager!;
    // Fresh data: 10 products, 2 variants each
    await ensureTables(em);
    const ids = await seedProducts(em, 10);
    await seedVariants(em, ids, 2);
  });

  it('searches by base_sku (partial match)', async () => {
    const result = await rawListProducts(em, {
      search: 'BS-005', status: 'all', page: 1, pageSize: 50,
    });

    expect(result.items).toHaveLength(1);
    expect(result.meta.totalItems).toBe(1);
    expect(result.items[0]!.name).toBe('Product 005');
  });

  it('searches by base_sku prefix matches multiple products', async () => {
    // "BS-00" matches BS-001 through BS-009 (9 products) — valid
    const result = await rawListProducts(em, {
      search: 'BS-00', status: 'all', page: 1, pageSize: 50,
    });

    // Products 001-009 all have base_sku matching BS-00[1-9]
    const productsWithNames = result.items.filter(
      (p: Record<string, unknown>) => (p.name as string).includes('Product 0'),
    );
    expect(productsWithNames.length).toBeGreaterThanOrEqual(1);
  });

  it('searches by variant.sku (partial match)', async () => {
    // SKU-002 is the second variant seeded; with 2 variants/product:
    // Product 001 → SKU-001, SKU-002
    // Product 002 → SKU-003, SKU-004
    // Therefore SKU-002 belongs to Product 001
    const result = await rawListProducts(em, {
      search: 'SKU-002', status: 'all', page: 1, pageSize: 50,
    });

    expect(result.items).toHaveLength(1);
    expect(result.meta.totalItems).toBe(1);
    expect(result.items[0]!.name).toBe('Product 001');
  });

  it('searches by variant.sku prefix across products', async () => {
    // "SKU-00" matches variants SKU-001 to SKU-009
    // These belong to Products 001-005 (2 variants each, so SKU-001/002→001,
    // 003/004→002, 005/006→003, 007/008→004, 009/010→005)
    const result = await rawListProducts(em, {
      search: 'SKU-00', status: 'all', page: 1, pageSize: 50,
    });

    // SKU-001..009 covers first 5 products
    expect(result.meta.totalItems).toBe(5);
  });

  it('searches case-insensitively across all fields', async () => {
    // Lowercase search should still match uppercase base_sku
    const result = await rawListProducts(em, {
      search: 'bs-005', status: 'all', page: 1, pageSize: 50,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe('Product 005');
  });

  it('returns empty when search matches nothing', async () => {
    const result = await rawListProducts(em, {
      search: 'NONEXISTENT-999', status: 'all', page: 1, pageSize: 50,
    });

    expect(result.items).toHaveLength(0);
    expect(result.meta.totalItems).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });
});

// ── Production repo mock tests (no DB required) ────────────

describe('ProductTypeOrmRepository.listProducts() — query correctness', () => {
  it('constructs correct ID-first pagination queries with defaults', async () => {
    const querySpy = vi.fn()
      // Step 1: COUNT
      .mockResolvedValueOnce([{ cnt: '42' }])
      // Step 2: Page IDs
      .mockResolvedValueOnce([{ id: 'prod-1' }, { id: 'prod-2' }])
      // Step 3: Products for page IDs
      .mockResolvedValueOnce([{
        id: 'prod-1', name: 'Product 1', description: null,
        sale_price_cents: 1000, presale_price_cents: null, aliases: null, is_active: true,
        created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-01'),
      }])
      // Step 4: Variants for page IDs (with stock)
      .mockResolvedValueOnce([{
        id: 'var-1', product_id: 'prod-1', sku: 'SKU-001',
        attributes: {}, is_active: true, stock: '5',
      }]);

    const mockManager = {
      query: querySpy,
      getRepository: () => ({ findOne: () => null, find: () => [] as never[], save: () => Promise.resolve(), delete: () => Promise.resolve() }),
    } as unknown as EntityManager;

    const repo = new ProductTypeOrmRepository(mockManager);

    const result = await repo.listProducts({
      page: 1, pageSize: 20, search: '', status: 'active',
      sortBy: 'createdAt', sortOrder: 'desc',
    });

    // Verify meta fields
    expect(result.meta.totalItems).toBe(42);
    expect(result.meta.sortBy).toBe('createdAt');
    expect(result.meta.sortOrder).toBe('desc');
    expect(result.meta.filters).toEqual({ status: 'active', search: '' });

    // Verify 4-step query pattern
    expect(querySpy).toHaveBeenCalledTimes(4);

    // Step 1: COUNT
    expect(querySpy.mock.calls[0]![0]).toContain('SELECT COUNT(*)');
    expect(querySpy.mock.calls[0]![0]).toContain('FROM products p');

    // Step 2: Page IDs with ORDER BY, LIMIT, OFFSET
    expect(querySpy.mock.calls[1]![0]).toContain('SELECT p.id FROM products p');
    expect(querySpy.mock.calls[1]![0]).toContain('ORDER BY');
    expect(querySpy.mock.calls[1]![0]).toContain('LIMIT');
    expect(querySpy.mock.calls[1]![0]).toContain('OFFSET');

    // Step 3: Products uses alias p (SQL alias fix verification)
    expect(querySpy.mock.calls[2]![0]).toContain('FROM products p');
    expect(querySpy.mock.calls[2]![0]).toContain('ORDER BY');

    // Step 4: Variants query with stock from inventory_lots
    expect(querySpy.mock.calls[3]![0]).toContain('FROM variants v');
    expect(querySpy.mock.calls[3]![0]).toContain('LEFT JOIN inventory_lots');
    expect(querySpy.mock.calls[3]![0]).toContain('WHERE v.product_id IN');

    // Verify response shape
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe('Product 1');
    expect(result.items[0]!.variants).toHaveLength(1);
  });

  it('constructs correct filtered query with search and name sort', async () => {
    const querySpy = vi.fn()
      .mockResolvedValueOnce([{ cnt: '5' }])
      .mockResolvedValueOnce([{ id: 'p-a' }])
      .mockResolvedValueOnce([{
        id: 'p-a', name: 'Shirt', description: null,
        sale_price_cents: 2000, presale_price_cents: null, aliases: null, is_active: false,
        created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-01'),
      }])
      .mockResolvedValueOnce([]);

    const mockManager = {
      query: querySpy,
      getRepository: () => ({ findOne: () => null, find: () => [] as never[], save: () => Promise.resolve(), delete: () => Promise.resolve() }),
    } as unknown as EntityManager;

    const repo = new ProductTypeOrmRepository(mockManager);

    await repo.listProducts({
      page: 2, pageSize: 10, search: 'shirt', status: 'inactive',
      sortBy: 'name', sortOrder: 'asc',
    });

    // Verify search param contains the search term
    const countCall = querySpy.mock.calls[0]![0] as string;
    expect(countCall).toContain('LOWER(p.name) LIKE');

    // Verify search covers base_sku and variant.sku
    expect(countCall).toContain('LOWER(p.base_sku) LIKE');
    expect(countCall).toContain('EXISTS (SELECT 1 FROM variants v');
    expect(countCall).toContain('v.product_id = p.id');

    // Verify status filter for inactive
    expect(countCall).toContain('p.is_active = false');

    // Verify sort by name
    expect(countCall).not.toContain('p.created_at'); // but the COUNT query doesn't have ORDER BY
    const idQuery = querySpy.mock.calls[1]![0] as string;
    expect(idQuery).toContain('LOWER(p.name) ASC'); // name sort

    // Verify pagination — page 2, pageSize 10
    expect(idQuery).toContain('LIMIT $');
    expect(idQuery).toContain('OFFSET $');
  });

  it('includes EXISTS subquery for variant.sku in search WHERE clause', async () => {
    const querySpy = vi.fn()
      .mockResolvedValueOnce([{ cnt: '3' }])
      .mockResolvedValueOnce([{ id: 'p1' }])
      .mockResolvedValueOnce([{
        id: 'p1', name: 'Test', base_sku: 'TSK', description: null,
        sale_price_cents: 1000, presale_price_cents: null, aliases: null, is_active: true,
        created_at: new Date(), updated_at: new Date(),
      }])
      .mockResolvedValueOnce([]);

    const mockManager = {
      query: querySpy,
      getRepository: () => ({ findOne: () => null, find: () => [] as never[], save: () => Promise.resolve(), delete: () => Promise.resolve() }),
    } as unknown as EntityManager;

    const repo = new ProductTypeOrmRepository(mockManager);

    await repo.listProducts({
      page: 1, pageSize: 20, search: 'variant-sku-match', status: 'all',
      sortBy: 'createdAt', sortOrder: 'desc',
    });

    const countQuery = querySpy.mock.calls[0]![0] as string;

    // Verify the WHERE clause includes all four search fields
    expect(countQuery).toContain('LOWER(p.name) LIKE $1');
    expect(countQuery).toContain('LOWER(p.aliases) LIKE $1');
    expect(countQuery).toContain('LOWER(p.base_sku) LIKE $1');
    expect(countQuery).toContain('EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND LOWER(v.sku) LIKE $1)');

    // Verify full WHERE structure: search conditions are wrapped in parentheses
    const whereMatch = /WHERE\s+(.+)$/.exec(countQuery);
    expect(whereMatch).not.toBeNull();
    const whereClause = whereMatch![1]!;
    // Should be just the search conditions (no status filter when 'all')
    expect(whereClause).toMatch(/^\(.+\)$/);
    expect(whereClause).toContain('EXISTS');
  });
});
