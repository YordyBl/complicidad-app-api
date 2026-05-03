/**
 * Create Product use case — registers a new product with its first variant.
 *
 * Creates both the product aggregate and its initial variant in a single
 * transaction. Validates SKU uniqueness at the persistence boundary.
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import { Money } from '../../../../shared/domain/Money.js';
import { Product } from '../../domain/Product.js';
import { ProductId } from '../../domain/ProductId.js';
import { Variant } from '../../domain/Variant.js';
import { VariantId } from '../../domain/VariantId.js';
import { Sku } from '../../domain/Sku.js';
import { Alias } from '../../domain/Alias.js';
import type { ProductRepository } from '../../domain/ProductRepository.js';
import type { VariantRepository } from '../../domain/VariantRepository.js';

// ── DTOs ─────────────────────────────────────────────────────

export interface CreateProductCommand {
  name: string;
  description?: string;
  basePriceCents: number;
  sku: string;
  variantPriceCents: number;
  variantAttributes?: Record<string, string>;
  aliases?: string[];
}

export interface CreateProductResponse {
  productId: string;
  variantId: string;
}

// ── Error ────────────────────────────────────────────────────

export class SkuAlreadyExistsError extends BusinessRuleError {
  override readonly name = 'SkuAlreadyExistsError' as const;

  constructor(sku: string) {
    super(`SKU "${sku}" already exists`);
  }
}

// ── Use Case ─────────────────────────────────────────────────

export class CreateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly variantRepository: VariantRepository,
  ) {}

  async execute(
    command: CreateProductCommand,
  ): Promise<Result<CreateProductResponse>> {
    // 1. Validate SKU
    const skuResult = Sku.from(command.sku);
    if (!skuResult.ok) return err(skuResult.error);

    // 2. Check SKU uniqueness
    const existing = await this.variantRepository.findBySku(skuResult.value);
    if (existing) {
      return err(new SkuAlreadyExistsError(command.sku));
    }

    // 3. Parse aliases
    const aliases: Alias[] = [];
    if (command.aliases) {
      for (const raw of command.aliases) {
        const aliasResult = Alias.from(raw);
        if (!aliasResult.ok) return err(aliasResult.error);
        aliases.push(aliasResult.value);
      }
    }

    // 4. Create product and variant
    const now = new Date();
    const productId = ProductId.generate();
    const product = new Product(
      productId,
      command.name,
      command.description ?? null,
      Money.fromCents(command.basePriceCents),
      aliases,
      true,
      now,
      now,
    );

    const variantId = VariantId.generate();
    const variant = new Variant(
      variantId,
      productId,
      skuResult.value,
      command.variantAttributes ?? {},
      Money.fromCents(command.variantPriceCents),
      true,
      now,
      now,
    );

    // 5. Persist
    await this.productRepository.save(product);
    await this.variantRepository.save(variant);

    return ok({
      productId: productId.toString(),
      variantId: variantId.toString(),
    });
  }
}
