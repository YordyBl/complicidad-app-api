/**
 * Express controller for product / variant endpoints.
 *
 * Translates between HTTP request/responses and the application use cases.
 * No domain logic here — just request parsing, validation, and response shaping.
 */
import type { Request, Response } from 'express';
import type { CreateProductUseCase } from '../../application/use-cases/CreateProductUseCase.js';
import type { SearchItemUseCase } from '../../application/use-cases/SearchItemUseCase.js';
import type { ListProductsUseCase } from '../../application/use-cases/ListProductsUseCase.js';
import {
  VALID_STATUSES,
  VALID_SORT_BY,
  VALID_SORT_ORDER,
} from '../../application/use-cases/list-products-constants.js';

// ── Controller ──────────────────────────────────────────────

export class ProductController {
  constructor(
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly searchItemUseCase?: SearchItemUseCase,
    private readonly listProductsUseCase?: ListProductsUseCase,
  ) {}

  /**
   * POST /products — create a new product with auto-generated variants from sizes.
   */
  async create(req: Request, res: Response): Promise<void> {
    const { name, description, baseSku, salePrice, presalePrice, sizes, aliases } =
      req.body as Record<string, unknown>;

    if (typeof name !== 'string') {
      res.status(400).json({ error: 'ValidationError', message: 'name is required and must be a string' });
      return;
    }
    if (typeof baseSku !== 'string' || baseSku.trim().length === 0) {
      res.status(400).json({ error: 'ValidationError', message: 'baseSku is required and must be a non-empty string' });
      return;
    }
    if (typeof salePrice !== 'number' || salePrice <= 0) {
      res.status(400).json({ error: 'ValidationError', message: 'salePrice is required and must be a positive number (soles)' });
      return;
    }
    if (!Array.isArray(sizes) || sizes.length === 0) {
      res.status(400).json({ error: 'ValidationError', message: 'sizes is required and must be a non-empty array of strings' });
      return;
    }

    const result = await this.createProductUseCase.execute({
      name,
      description: typeof description === 'string' ? description : undefined,
      baseSku,
      salePrice,
      presalePrice: typeof presalePrice === 'number' ? presalePrice : undefined,
      sizes: sizes.map(String),
      aliases: Array.isArray(aliases) ? aliases.map(String) : undefined,
    } as Parameters<typeof this.createProductUseCase.execute>[0]);

    if (!result.ok) {
      res.status(400).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(201).json(result.value);
  }

  /**
   * GET /items/search — search for items by SKU or product alias.
   * Query param: ?term=COLA-500ML
   */
  async search(req: Request, res: Response): Promise<void> {
    if (!this.searchItemUseCase) {
      res.status(503).json({ error: 'ServiceUnavailable', message: 'Search not available' });
      return;
    }

    const term = typeof req.query.term === 'string' ? req.query.term.trim() : '';
    if (!term) {
      res.status(400).json({ error: 'ValidationError', message: 'term query parameter is required' });
      return;
    }

    const result = await this.searchItemUseCase.execute({ term });

    if (!result.ok) {
      res.status(404).json({ error: result.error.name, message: result.error.message });
      return;
    }

    res.status(200).json(result.value);
  }

  /**
   * GET /products — list products with pagination, search, filters, and sort.
   *
   * Validates query params per spec and returns machine-readable 400 on invalid input.
   * Delegates normalization and data retrieval to ListProductsUseCase.
   * Maps internal `items` to public API `data` per spec naming convention.
   */
  async list(req: Request, res: Response): Promise<void> {
    if (!this.listProductsUseCase) {
      res.status(503).json({ error: 'ServiceUnavailable', message: 'Product listing not available' });
      return;
    }

    const { page, pageSize, search, status, sortBy, sortOrder } =
      req.query as Record<string, string | undefined>;

    // ── Validate page ──────────────────────────────────────
    if (page !== undefined) {
      const pageNum = Number(page);
      if (!Number.isInteger(pageNum) || pageNum < 1) {
        res.status(400).json({
          error: 'ValidationError',
          message: 'page must be a positive integer',
        });
        return;
      }
    }

    // ── Validate pageSize ──────────────────────────────────
    if (pageSize !== undefined) {
      const psNum = Number(pageSize);
      if (!Number.isInteger(psNum) || psNum < 1 || psNum > 100) {
        res.status(400).json({
          error: 'ValidationError',
          message: 'pageSize must be an integer between 1 and 100',
        });
        return;
      }
    }

    // ── Validate search ────────────────────────────────────
    if (search !== undefined && search.length > 100) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'search must be at most 100 characters',
      });
      return;
    }

    // ── Validate status ────────────────────────────────────
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'status must be one of: active, inactive, all',
      });
      return;
    }

    // ── Validate sortBy ────────────────────────────────────
    if (sortBy !== undefined && !VALID_SORT_BY.has(sortBy)) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'sortBy must be one of: name, createdAt, updatedAt',
      });
      return;
    }

    // ── Validate sortOrder ─────────────────────────────────
    if (sortOrder !== undefined && !VALID_SORT_ORDER.has(sortOrder)) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'sortOrder must be one of: asc, desc',
      });
      return;
    }

    // ── Delegate to use case ───────────────────────────────
    // Build input without undefined values to satisfy exactOptionalPropertyTypes.
    const input: Record<string, string> = {};
    if (page !== undefined) input.page = page;
    if (pageSize !== undefined) input.pageSize = pageSize;
    if (search !== undefined) input.search = search;
    if (status !== undefined) input.status = status;
    if (sortBy !== undefined) input.sortBy = sortBy;
    if (sortOrder !== undefined) input.sortOrder = sortOrder;

    const result = await this.listProductsUseCase.execute(input);

    // Map internal items → data for public API (per spec)
    res.status(200).json({
      data: result.items,
      meta: result.meta,
    });
  }
}
