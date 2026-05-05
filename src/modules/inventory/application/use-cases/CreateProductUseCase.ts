/**
 * Create Product use case — registers a new product with auto-generated
 * variants from size list.
 *
 * Creates the product aggregate and one variant per size in a single
 * operation. Variant SKUs are auto-generated from baseSku + size,
 * normalized to lowercase. Validates SKU uniqueness at the persistence
 * boundary.
 *
 * The command accepts soles decimals at the boundary; conversion to
 * integer cents happens here for internal domain/persistence.
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
  /** User-provided base SKU for variant generation. Normalized to lowercase internally. */
  baseSku: string;
  /** Regular sale price in soles (e.g. 120.50). Converted to cents internally. */
  salePrice: number;
  /** Optional presale/preventa price in soles. Converted to cents internally. */
  presalePrice?: number;
  /** Size labels to generate variants from (e.g. ["S", "M", "L"]). At least one required. */
  sizes: string[];
  aliases?: string[];
}

export interface CreateProductResponse {
  productId: string;
  variantIds: string[];
}

// ── Errors ────────────────────────────────────────────────────

export class SkuAlreadyExistsError extends BusinessRuleError {
  override readonly name = 'SkuAlreadyExistsError' as const;

  constructor(sku: string) {
    super(`El SKU "${sku}" ya existe`);
  }
}

export class EmptySizesError extends BusinessRuleError {
  override readonly name = 'EmptySizesError' as const;

  constructor() {
    super('Se requiere al menos un talle');
  }
}

export class InvalidBaseSkuError extends BusinessRuleError {
  override readonly name = 'InvalidBaseSkuError' as const;

  constructor() {
    super('El SKU base es obligatorio y debe ser un string no vacío');
  }
}

export class PerSizePricingError extends BusinessRuleError {
  override readonly name = 'PerSizePricingError' as const;

  constructor() {
    super('El precio por talle no está soportado. Los precios pertenecen al producto, no a talles individuales.');
  }
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Convert soles decimal to integer cents.
 * Rounds to nearest cent.
 */
function solesToCents(soles: number): number {
  return Math.round(soles * 100);
}

/**
 * Generate a variant SKU from baseSku and size.
 * Lowercase-normalized, whitespace/dashes handled.
 * Example: baseSku="Zapato" + size="XL" → "zapato-xl"
 */
function generateVariantSku(baseSku: string, size: string): string {
  const basePart = baseSku
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const sizePart = size.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${basePart}-${sizePart}`;
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
    // 1. Validate base SKU
    if (!command.baseSku || command.baseSku.trim().length === 0) {
      return err(new InvalidBaseSkuError());
    }
    const baseSkuNormalized = command.baseSku.trim().toLowerCase();

    // 2. Validate sizes
    const sizes = command.sizes.map((s) => s.trim()).filter((s) => s.length > 0);
    if (sizes.length === 0) {
      return err(new EmptySizesError());
    }

    // 3. Generate and validate all SKUs first (before any persistence)
    const skuResults: { size: string; sku: Sku }[] = [];
    for (const size of sizes) {
      const rawSku = generateVariantSku(baseSkuNormalized, size);
      const skuResult = Sku.from(rawSku);
      if (!skuResult.ok) return err(skuResult.error);

      const existing = await this.variantRepository.findBySku(skuResult.value);
      if (existing) {
        return err(new SkuAlreadyExistsError(rawSku));
      }
      skuResults.push({ size, sku: skuResult.value });
    }

    // 4. Parse aliases
    const aliases: Alias[] = [];
    if (command.aliases) {
      for (const raw of command.aliases) {
        const aliasResult = Alias.from(raw);
        if (!aliasResult.ok) return err(aliasResult.error);
        aliases.push(aliasResult.value);
      }
    }

    // 5. Convert soles to cents
    const salePriceCents = solesToCents(command.salePrice);
    const presalePriceCents = command.presalePrice !== undefined
      ? solesToCents(command.presalePrice)
      : undefined;

    // 6. Create product
    const now = new Date();
    const productId = ProductId.generate();
    const product = new Product(
      productId,
      command.name,
      command.description ?? null,
      baseSkuNormalized,
      Money.fromCents(salePriceCents),
      presalePriceCents !== undefined
        ? Money.fromCents(presalePriceCents)
        : null,
      aliases,
      true,
      now,
      now,
    );

    // 7. Persist product first
    await this.productRepository.save(product);

    // 8. Create one variant per size
    const variantIds: string[] = [];
    for (const { size, sku } of skuResults) {
      const variantId = VariantId.generate();
      const variant = new Variant(
        variantId,
        productId,
        sku,
        { size },
        true,
        now,
        now,
      );
      await this.variantRepository.save(variant);
      variantIds.push(variantId.toString());
    }

    return ok({
      productId: productId.toString(),
      variantIds,
    });
  }
}
