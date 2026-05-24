/**
 * Read-port contract for enriching sale detail with customer and garment data.
 *
 * Defined in the application layer so GetSaleDetailUseCase depends on an
 * interface rather than on TypeORM or any infrastructure library.
 *
 * The enrichment provides flat customer fields (name, phone, address, district)
 * and human-readable garment labels (displayLabel, productName, sku, attributes)
 * required by constancia PDFs and delivery messages.
 */

// ── Enriched Read Models ─────────────────────────────────────

export interface EnrichedCustomerFields {
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  customerDistrict: string | null;
  /** Google Maps URL for the customer's address (from customers table). */
  googleMapsUrl: string | null;
}

export interface EnrichedLineDisplay {
  lineId: string;
  /** Human-readable display label (productName → sku → "Variante sin datos"). */
  displayLabel: string;
  productName: string | null;
  sku: string | null;
  /** Variant attributes (e.g. { color: "Blanco", size: "M" }). */
  attributes: Record<string, string>;
}

export interface EnrichedSaleDetail extends EnrichedCustomerFields {
  lines: EnrichedLineDisplay[];
}

// ── Repository Port ──────────────────────────────────────────

export interface SaleDetailReadRepository {
  /**
   * Load enriched customer and garment display data for a given sale.
   *
   * The implementation MUST LEFT JOIN `customers`, `variants`, and `products`
   * tables. Missing customer/variant/product records MUST return null for
   * nullable fields rather than causing errors or excluding the sale line.
   *
   * Returns null when the sale does not exist (consistent with
   * NotFoundError handling in the use case).
   */
  findBySaleId(saleId: string): Promise<EnrichedSaleDetail | null>;
}
