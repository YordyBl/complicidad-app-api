/**
 * Express controller for product / variant endpoints.
 *
 * Translates between HTTP request/responses and the application use cases.
 * No domain logic here — just request parsing, validation, and response shaping.
 */
import type { Request, Response } from 'express';
import type { CreateProductUseCase } from '../../application/use-cases/CreateProductUseCase.js';
import type { SearchItemUseCase } from '../../application/use-cases/SearchItemUseCase.js';

export class ProductController {
  constructor(
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly searchItemUseCase?: SearchItemUseCase,
  ) {}

  /**
   * POST /products — create a new product with its first variant.
   */
  async create(req: Request, res: Response): Promise<void> {
    const { name, description, basePriceCents, sku, variantPriceCents, variantAttributes, aliases } =
      req.body as Record<string, unknown>;

    if (typeof name !== 'string' || typeof sku !== 'string') {
      res.status(400).json({ error: 'ValidationError', message: 'name and sku are required and must be strings' });
      return;
    }
    if (typeof basePriceCents !== 'number' || typeof variantPriceCents !== 'number') {
      res.status(400).json({ error: 'ValidationError', message: 'basePriceCents and variantPriceCents must be numbers' });
      return;
    }

    const result = await this.createProductUseCase.execute({
      name,
      description: typeof description === 'string' ? description : undefined,
      basePriceCents,
      sku,
      variantPriceCents,
      variantAttributes: typeof variantAttributes === 'object' && variantAttributes !== null
        ? (variantAttributes as Record<string, string>)
        : undefined,
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
}
