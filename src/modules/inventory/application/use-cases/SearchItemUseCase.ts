/**
 * Search Item use case — searches by SKU or product alias and resolves
 * the relevant product/variant data unambiguously.
 *
 * Flow:
 * 1. Try exact SKU match via VariantRepository.findBySku
 * 2. If no SKU match, search product aliases via ProductRepository.findByAlias
 * 3. For alias matches, resolve all variants of the matched products
 * 4. Return structured results with match type indicator
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import { Sku } from '../../domain/Sku.js';
import { VariantId } from '../../domain/VariantId.js';
import type { VariantRepository } from '../../domain/VariantRepository.js';
import type { ProductRepository } from '../../domain/ProductRepository.js';
import type { InventoryLotRepository } from '../../domain/InventoryLotRepository.js';

// ── DTOs ─────────────────────────────────────────────────────

export interface SearchItemCommand {
  term: string;
}

export interface ResolvedItem {
  productId: string;
  productName: string;
  variantId: string;
  variantSku: string;
  /** Regular sale price in soles (from Product). */
  salePrice: number;
  /** Presale price in soles (from Product), null when not set. */
  presalePrice: number | null;
  variantAttributes: Record<string, string>;
  /** Available stock (sum of open lot remaining quantities). Always ≥ 0. */
  stock: number;
}

export interface SearchItemResponse {
  matchType: 'sku' | 'alias';
  items: ResolvedItem[];
}

// ── Use Case ─────────────────────────────────────────────────

export class SearchItemUseCase {
  constructor(
    private readonly variantRepository: VariantRepository,
    private readonly productRepository: ProductRepository,
    private readonly lotRepository: InventoryLotRepository,
  ) {}

  /**
   * Compute available stock for a variant by summing remaining quantities
   * of all open (non-exhausted) purchase lots.
   */
  private async computeStock(variantId: string): Promise<number> {
    const lots = await this.lotRepository.findByVariantIdOrderedByDate(
      VariantId.from(variantId),
    );
    return lots.reduce((sum, lot) => sum + (lot.remainingQuantity > 0 ? lot.remainingQuantity : 0), 0);
  }

  async execute(
    command: SearchItemCommand,
  ): Promise<Result<SearchItemResponse>> {
    const trimmed = command.term.trim();
    if (trimmed.length === 0) {
      return err(new NotFoundError('Item', command.term));
    }

    // 1. Try exact SKU match first
    const skuResult = Sku.from(trimmed);
    if (skuResult.ok) {
      const variant = await this.variantRepository.findBySku(skuResult.value);
      if (variant) {
        const product = await this.productRepository.findById(variant.productId);
        const stock = await this.computeStock(variant.id.toString());
        return ok({
          matchType: 'sku',
          items: [
            {
              productId: variant.productId.toString(),
              productName: product?.name ?? 'Unknown',
              variantId: variant.id.toString(),
              variantSku: variant.sku.value,
              salePrice: product?.salePrice.cents != null ? product.salePrice.cents / 100 : 0,
              presalePrice: product?.presalePrice?.cents != null ? product.presalePrice.cents / 100 : null,
              variantAttributes: { ...variant.attributes },
              stock,
            },
          ],
        });
      }
    }

    // 2. Fallback: search by alias
    const aliasLower = trimmed.toLowerCase();
    const products = await this.productRepository.findByAlias(aliasLower);

    if (products.length === 0) {
      return err(new NotFoundError('Item', command.term));
    }

    // 3. Resolve variants for matched products
    const items: ResolvedItem[] = [];
    for (const product of products) {
      const variants = await this.variantRepository.findByProductId(product.id);
      for (const variant of variants) {
        const stock = await this.computeStock(variant.id.toString());
        items.push({
          productId: product.id.toString(),
          productName: product.name,
          variantId: variant.id.toString(),
          variantSku: variant.sku.value,
          salePrice: product.salePrice.cents / 100,
          presalePrice: product.presalePrice?.cents != null ? product.presalePrice.cents / 100 : null,
          variantAttributes: { ...variant.attributes },
          stock,
        });
      }
    }

    return ok({ matchType: 'alias', items });
  }
}
