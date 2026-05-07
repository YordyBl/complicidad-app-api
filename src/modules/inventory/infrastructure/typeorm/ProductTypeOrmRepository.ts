/**
 * TypeORM-backed implementation of the ProductRepository port
 * and ProductListReadRepository read-port.
 *
 * Uses ID-first pagination for product listing to prevent
 * one-to-many product+variant join corruption of page sizes.
 */
import { Repository, type EntityManager, Like } from 'typeorm';
import type { ProductRepository } from '../../domain/ProductRepository.js';
import type { ProductListReadRepository } from '../../domain/ProductListReadRepository.js';
import type {
  ListProductsQuery,
  ListProductsResult,
  ProductListItem,
} from '../../domain/ProductListReadRepository.js';
import type { Product } from '../../domain/Product.js';
import type { ProductId } from '../../domain/ProductId.js';
import { ProductEntity } from './ProductEntity.js';
import { ProductMapper } from './ProductMapper.js';
import { VariantMapper } from './VariantMapper.js';

// ── Raw query row shapes ───────────────────────────────────

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  base_sku: string;
  sale_price_cents: number;
  presale_price_cents: number | null;
  aliases: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  attributes: Record<string, string>;
  is_active: boolean;
  /** Numeric aggregate from COALESCE(SUM(...), 0) — returned as string by PG */
  stock: string;
}

// ── Implementation ──────────────────────────────────────────

export class ProductTypeOrmRepository
  implements ProductRepository, ProductListReadRepository
{
  private readonly repo: Repository<ProductEntity>;
  private readonly productMapper = new ProductMapper();
  private readonly variantMapper = new VariantMapper();

  constructor(private readonly manager: EntityManager) {
    this.repo = manager.getRepository(ProductEntity);
  }

  // ── ProductRepository methods ────────────────────────────

  async findById(id: ProductId): Promise<Product | null> {
    const entity = await this.repo.findOne({ where: { id: id.toString() } });
    return entity ? this.productMapper.toDomain(entity) : null;
  }

  async findByAlias(alias: string): Promise<Product[]> {
    const entities = await this.repo.find({
      where: [
        { name: Like(`%${alias}%`) },
        { aliases: Like(`%${alias}%`) },
      ],
    });
    return entities.map((e) => this.productMapper.toDomain(e));
  }

  async save(product: Product): Promise<void> {
    const entity = this.productMapper.toPersistence(product);
    await this.repo.save(entity);
  }

  async delete(id: ProductId): Promise<void> {
    await this.repo.delete(id.toString());
  }

  async findAllActive(): Promise<Product[]> {
    const entities = await this.repo.find({ where: { isActive: true } });
    return entities.map((e) => this.productMapper.toDomain(e));
  }

  // ── ProductListReadRepository — getProductById ───────────

  async getProductById(id: string): Promise<ProductListItem | null> {
    // Step 1: Load product row
    const prodQuery = `SELECT * FROM products p WHERE p.id = $1`;
    const prodRows: ProductRow[] = await this.manager.query(prodQuery, [id]);

    if (prodRows.length === 0) return null;

    const p = prodRows[0];
    if (!p) return null;

    // Step 2: Load variants with stock for this product
    const varQuery = `
      SELECT v.*, COALESCE(SUM(il.remaining_quantity), 0) AS stock
      FROM variants v
      LEFT JOIN inventory_lots il ON il.variant_id = v.id AND il.remaining_quantity > 0
      WHERE v.product_id = $1
      GROUP BY v.id
    `;
    const varRows: VariantRow[] = await this.manager.query(varQuery, [id]);

    // Step 3: Assemble ProductListItem
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      baseSku: p.base_sku,
      salePrice: p.sale_price_cents / 100,
      presalePrice: p.presale_price_cents != null ? p.presale_price_cents / 100 : null,
      isActive: p.is_active,
      createdAt: p.created_at.toISOString(),
      updatedAt: p.updated_at.toISOString(),
      variants: varRows.map((v) => ({
        id: v.id,
        sku: v.sku,
        attributes: v.attributes,
        isActive: v.is_active,
        stock: Number(v.stock),
      })),
    };
  }

  // ── ProductListReadRepository — listProducts ─────────────

  /**
   * DB-backed deterministic pagination using count + page-ID approach.
   *
   * Step 1: COUNT matching products (with filters).
   * Step 2: SELECT only ids for the current page (with sort + tie-breaker).
   * Step 3: SELECT full product rows only for those IDs.
   * Step 4: SELECT variant rows only for those product IDs.
   * Step 5: Assemble items + meta.
   *
   * This prevents one-to-many joins from corrupting product page size.
   */
  async listProducts(query: ListProductsQuery): Promise<ListProductsResult> {
    const { page, pageSize, search, status, sortBy, sortOrder } = query;

    // ── Build WHERE clause ──────────────────────────────────
    const conditions: string[] = [];
    const params: unknown[] = [];
    let pindex = 1;

    if (status === 'active') {
      conditions.push(`p.is_active = true`);
    } else if (status === 'inactive') {
      conditions.push(`p.is_active = false`);
    }
    // 'all' → no status filter

    if (search.length > 0) {
      conditions.push(
        `(LOWER(p.name) LIKE $${String(pindex)}` +
        ` OR LOWER(p.aliases) LIKE $${String(pindex)}` +
        ` OR LOWER(p.base_sku) LIKE $${String(pindex)}` +
        ` OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND LOWER(v.sku) LIKE $${String(pindex)}))`,
      );
      params.push(`%${search.toLowerCase()}%`);
      pindex++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ── Build ORDER BY clause (whitelisted + tie-breaker) ──
    const sortDir = sortOrder.toUpperCase() as 'ASC' | 'DESC';
    let orderBy: string;
    switch (sortBy) {
      case 'name':
        orderBy = `LOWER(p.name) ${sortDir}, p.id ${sortDir}`;
        break;
      case 'updatedAt':
        orderBy = `p.updated_at ${sortDir}, p.id ${sortDir}`;
        break;
      case 'createdAt':
      default:
        orderBy = `p.created_at ${sortDir}, p.id ${sortDir}`;
        break;
    }

    // ── Step 1: Count ──────────────────────────────────────
    const countQuery = `SELECT COUNT(*) AS cnt FROM products p ${where}`;
    const countRows: { cnt: string }[] = await this.manager.query(countQuery, params);
    const totalItems = Number(countRows[0]?.cnt ?? 0);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const offset = (page - 1) * pageSize;

    // ── Step 2: Page IDs ────────────────────────────────────
    const idQuery = `SELECT p.id FROM products p ${where} ORDER BY ${orderBy} LIMIT $${String(pindex)} OFFSET $${String(pindex + 1)}`;
    const idParams = [...params, pageSize, offset];
    const idRows: { id: string }[] = await this.manager.query(idQuery, idParams);
    const pageIds = idRows.map((r) => r.id);

    if (pageIds.length === 0) {
      return {
        items: [],
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

    // ── Step 3: Load products for page IDs ──────────────────
    const inParams = pageIds.map((_, i) => `$${String(i + 1)}`);
    const prodQuery = `SELECT * FROM products p WHERE id IN (${inParams.join(', ')}) ORDER BY ${orderBy}`;
    const prodRows: ProductRow[] = await this.manager.query(prodQuery, pageIds);

    // ── Step 4: Load variants for page product IDs ──────────
    // LEFT JOIN with inventory_lots to compute available stock per variant
    const varQuery = `
      SELECT v.*, COALESCE(SUM(il.remaining_quantity), 0) AS stock
      FROM variants v
      LEFT JOIN inventory_lots il ON il.variant_id = v.id AND il.remaining_quantity > 0
      WHERE v.product_id IN (${inParams.join(', ')})
      GROUP BY v.id
    `;
    const varRows: VariantRow[] = await this.manager.query(varQuery, pageIds);

    // ── Step 5: Assemble items ──────────────────────────────
    const variantsByProduct = new Map<string, VariantRow[]>();
    for (const v of varRows) {
      const list = variantsByProduct.get(v.product_id);
      if (list) {
        list.push(v);
      } else {
        variantsByProduct.set(v.product_id, [v]);
      }
    }

    const items: ProductListItem[] = prodRows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      baseSku: p.base_sku,
      salePrice: p.sale_price_cents / 100,
      presalePrice: p.presale_price_cents != null ? p.presale_price_cents / 100 : null,
      isActive: p.is_active,
      createdAt: p.created_at.toISOString(),
      updatedAt: p.updated_at.toISOString(),
      variants: (variantsByProduct.get(p.id) ?? []).map((v) => ({
        id: v.id,
        sku: v.sku,
        attributes: v.attributes,
        isActive: v.is_active,
        stock: Number(v.stock),
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
}
