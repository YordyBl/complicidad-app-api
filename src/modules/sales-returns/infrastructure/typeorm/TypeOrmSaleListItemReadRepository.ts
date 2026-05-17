/**
 * TypeORM-backed implementation of SaleListItemReadRepository.
 *
 * Queries sale_lines with LEFT JOINs to variants and products in a
 * single batched query. Missing product/variant metadata is returned
 * as `null` rather than causing errors.
 */
import type { EntityManager } from 'typeorm';
import type {
  SaleListItemReadRepository,
  SaleListItem,
} from '../../application/ports/SaleListItemReadRepository.js';
import { computeDisplayLabel } from '../../application/ports/SaleListItemReadRepository.js';
import { SaleLineEntity } from './SaleLineEntity.js';
import { SaleEntity } from './SaleEntity.js';

interface SaleLineRow {
  line_id: string;
  sale_id: string;
  line_variant_id: string;
  line_quantity: number;
  line_unit_price_cents: number;
  line_price_type: string;
  variant_sku: string | null;
  /** JSONB column — TypeORM/Postgres may return it already parsed (object) or as a raw string. */
  variant_attributes: unknown;
  product_name: string | null;
}

/**
 * Safely normalise a JSONB value into a Record<string, string>.
 *
 * PostgreSQL + TypeORM raw queries may return JSONB columns in two forms:
 * - Already parsed as a plain object (TypeORM driver behaviour).
 * - As a serialised JSON string (raw driver / older pg behaviour).
 *
 * This normaliser handles both, and falls back to `{}` for null,
 * undefined, arrays, primitives, and malformed JSON.
 */
export function safeParseAttributes(raw: unknown): Record<string, string> {
  if (raw === null || raw === undefined) return {};

  // Already a plain object (not an array) — the common case with pg driver.
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, string>;
  }

  // String serialisation — parse and validate.
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // Malformed JSON — fall through to empty.
    }
  }

  return {};
}

export class TypeOrmSaleListItemReadRepository implements SaleListItemReadRepository {
  constructor(private readonly manager: EntityManager) {}

  async findBySaleIds(ids: string[]): Promise<SaleListItem[]> {
    if (ids.length === 0) return [];

    // Use the EntityManager directly with a parameterized raw query.
    // LEFT JOIN ensures we get sale lines even when variant/product are missing.
    const rawRows: unknown[] = await this.manager
      .createQueryBuilder(SaleLineEntity, 'sl')
      .innerJoin(SaleEntity, 's', 's.id = sl.sale_id')
      .leftJoin('variants', 'v', 'v.id = sl.variant_id')
      .leftJoin('products', 'p', 'p.id = v.product_id')
      .select([
        'sl.id AS line_id',
        'sl.sale_id AS sale_id',
        'sl.variant_id AS line_variant_id',
        'sl.quantity AS line_quantity',
        'sl.unit_price_cents AS line_unit_price_cents',
        'sl.price_type AS line_price_type',
        'v.sku AS variant_sku',
        'v.attributes AS variant_attributes',
        'p.name AS product_name',
      ])
      .where('sl.sale_id IN (:...ids)', { ids })
      .orderBy('sl.created_at', 'ASC')
      .getRawMany();

    const rows = rawRows as SaleLineRow[];

    return rows.map((row) => this.toItem(row));
  }

  private toItem(row: SaleLineRow): SaleListItem {
    const attributes = safeParseAttributes(row.variant_attributes);
    const productName = row.product_name ?? null;
    const sku = row.variant_sku ?? null;

    return {
      lineId: row.line_id,
      saleId: row.sale_id,
      variantId: row.line_variant_id,
      productName,
      sku,
      displayLabel: computeDisplayLabel(productName, sku),
      attributes,
      quantity: row.line_quantity,
      unitPriceCents: row.line_unit_price_cents,
      priceType: row.line_price_type === 'presale' ? 'presale' : 'regular',
    };
  }
}
