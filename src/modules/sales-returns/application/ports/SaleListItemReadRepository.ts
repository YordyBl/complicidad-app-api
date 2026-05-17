/**
 * Read-port contracts for sale list item display.
 *
 * Defined in the application layer so the ListSalesUseCase depends on an
 * interface rather than on TypeORM or any other infrastructure library.
 *
 * The batched `findBySaleIds` method avoids N+1 queries per sale while
 * the grouping by `saleId` in the use case prevents duplicated sale rows.
 */

// ── Read Models ─────────────────────────────────────────────

/**
 * Display row for a single sold item within a sale.
 *
 * Includes labeling metadata resolved from current product/variant
 * records so the APP can render garment details inline.
 */
export interface SaleListItem {
  /** Sale line unique identifier. */
  lineId: string;
  /** Owning sale identifier — used for grouping in the use case. */
  saleId: string;
  /** Variant ID the line references. */
  variantId: string;
  /** Current product name (null when product is missing). */
  productName: string | null;
  /** Current variant SKU (null when variant is missing). */
  sku: string | null;
  /**
   * Human-readable display label computed from available metadata.
   *
   * Fallback chain: productName → SKU → "Variante sin datos".
   * The APP MUST use this field for display; it MUST NOT infer labels
   * from variantId or other raw identifiers.
   */
  displayLabel: string;
  /** Variant attributes (e.g. color, size). Empty object when unavailable. */
  attributes: Record<string, string>;
  /** Quantity sold. */
  quantity: number;
  /** Snapshot of unit price in cents at sale time. */
  unitPriceCents: number;
  /** Whether regular or presale pricing was used. */
  priceType: 'regular' | 'presale';
}

// ── Repository Port ─────────────────────────────────────────

export interface SaleListItemReadRepository {
  /**
   * Batch-load display rows for the given sale identifiers.
   *
   * The implementation MUST query sale_lines with a LEFT JOIN to
   * variants and products in a single query to avoid N+1 overhead.
   * Missing product/variant metadata MUST be returned as `null`
   * rather than causing errors or excluding rows.
   *
   * Returns an empty array when `ids` is empty or no matching lines exist.
   */
  findBySaleIds(ids: string[]): Promise<SaleListItem[]>;
}

// ── Pure Helpers ────────────────────────────────────────────

/**
 * Compute a human-readable display label from available garment metadata.
 *
 * Fallback chain (first available wins):
 * 1. `productName` — the product's display name (e.g. "Camiseta")
 * 2. `sku`          — the variant's SKU code (e.g. "CAM-BLA-M")
 * 3. `"Variante sin datos"` — ultimate fallback when no metadata is available
 *
 * This function MUST be used by repository implementations when building
 * `SaleListItem` rows so that the APP never needs to infer labels from
 * raw IDs.
 */
export function computeDisplayLabel(
  productName: string | null,
  sku: string | null,
): string {
  if (productName && productName.length > 0) return productName;
  if (sku && sku.length > 0) return sku;
  return 'Variante sin datos';
}
