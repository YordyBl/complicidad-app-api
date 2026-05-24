/**
 * TypeORM-backed implementation of SaleDetailReadRepository.
 *
 * Queries customers, variants, and products tables via LEFT JOINs to
 * enrich sale detail responses with customer display/contact data and
 * readable garment labels. Missing records return null gracefully.
 */
import type { EntityManager } from 'typeorm';
import type {
  SaleDetailReadRepository,
  EnrichedSaleDetail,
  EnrichedLineDisplay,
} from '../../application/ports/SaleDetailReadRepository.js';
import { computeDisplayLabel } from '../../application/ports/SaleListItemReadRepository.js';
import { safeParseAttributes } from './TypeOrmSaleListItemReadRepository.js';

interface CustomerRow {
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_district: string | null;
  customer_google_maps_url: string | null;
}

interface LineRow {
  line_id: string;
  variant_sku: string | null;
  variant_attributes: unknown;
  product_name: string | null;
}

export class TypeOrmSaleDetailReadRepository implements SaleDetailReadRepository {
  constructor(private readonly manager: EntityManager) {}

  async findBySaleId(saleId: string): Promise<EnrichedSaleDetail | null> {
    // ── Check sale existence ──────────────────────────────────
    const saleExists: unknown = await this.manager
      .createQueryBuilder()
      .select('1')
      .from('sales', 's')
      .where('s.id = :id', { id: saleId })
      .getRawOne();

    if (!saleExists) return null;

    // ── Load customer fields ──────────────────────────────────
    const customerRows: unknown[] = await this.manager
      .createQueryBuilder()
      .select([
        'c.name AS customer_name',
        'c.phone AS customer_phone',
        'c.address AS customer_address',
        'c.district AS customer_district',
        'c.google_maps_url AS customer_google_maps_url',
      ])
      .from('sales', 's')
      .leftJoin('customers', 'c', 'c.id = s.customer_id')
      .where('s.id = :id', { id: saleId })
      .getRawMany();

    const cust = (customerRows[0] as CustomerRow | undefined) ?? {
      customer_name: 'Cliente desconocido',
      customer_phone: null,
      customer_address: null,
      customer_district: null,
      customer_google_maps_url: null,
    };

    // ── Load garment display rows ─────────────────────────────
    const lineRowsRaw: unknown[] = await this.manager
      .createQueryBuilder()
      .select([
        'sl.id AS line_id',
        'v.sku AS variant_sku',
        'v.attributes AS variant_attributes',
        'p.name AS product_name',
      ])
      .from('sale_lines', 'sl')
      .leftJoin('variants', 'v', 'v.id = sl.variant_id')
      .leftJoin('products', 'p', 'p.id = v.product_id')
      .where('sl.sale_id = :id', { id: saleId })
      .orderBy('sl.created_at', 'ASC')
      .getRawMany();

    const lineRows = lineRowsRaw as LineRow[];

    const lines: EnrichedLineDisplay[] = lineRows.map((row) => {
      const attributes = safeParseAttributes(row.variant_attributes);
      const productName = row.product_name ?? null;
      const sku = row.variant_sku ?? null;

      return {
        lineId: row.line_id,
        displayLabel: computeDisplayLabel(productName, sku),
        productName,
        sku,
        attributes,
      };
    });

    return {
      customerName: cust.customer_name,
      customerPhone: cust.customer_phone,
      customerAddress: cust.customer_address,
      customerDistrict: cust.customer_district,
      googleMapsUrl: cust.customer_google_maps_url,
      lines,
    };
  }
}
