/**
 * TypeORM-backed read-only report query adapter.
 *
 * Implements the ReportReadRepository port by querying across
 * multiple tables using TypeORM's QueryBuilder.
 *
 * This lives in infrastructure because it directly queries the
 * database — no domain entities are constructed.
 */
import { type EntityManager } from 'typeorm';
import type {
  ReportReadRepository,
  StockByProductItem,
  LotReportItem,
} from '../../domain/ReportReadRepository.js';

export class ReportQueryAdapter implements ReportReadRepository {
  constructor(private readonly manager: EntityManager) {}

  async getLiquidityCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(amount_cents), 0)', 'total')
      .from('cash_ledger_entries', 'e')
      .getRawOne<{ total: number | null }>();

    return result?.total ?? 0;
  }

  async getStockInvestmentCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(remaining_quantity * unit_cost_cents), 0)', 'total')
      .from('inventory_lots', 'l')
      .where('l.remaining_quantity > 0')
      .getRawOne<{ total: number | null }>();

    return result?.total ?? 0;
  }

  async getSalesIncomeCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(sl.quantity * sl.unit_price_cents), 0)', 'total')
      .from('sale_lines', 'sl')
      .innerJoin('sales', 's', 's.id = sl.sale_id')
      .where("s.status = 'ACTIVE'")
      .getRawOne<{ total: number | null }>();

    return result?.total ?? 0;
  }

  async getFifoCostsCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(lcr.subtotal_cents), 0)', 'total')
      .from('lot_consumption_records', 'lcr')
      .innerJoin('sale_lines', 'sl', 'sl.id = lcr.sale_line_id')
      .innerJoin('sales', 's', 's.id = sl.sale_id')
      .where("s.status = 'ACTIVE'")
      .getRawOne<{ total: number | null }>();

    return result?.total ?? 0;
  }

  async getReinvestmentCents(): Promise<number> {
    const result = await this.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(e.amount_cents), 0)', 'total')
      .from('cash_ledger_entries', 'e')
      .where("e.type = 'PURCHASE_OUTFLOW'")
      .getRawOne<{ total: number | null }>();

    // amount_cents is negative for outflows; return the absolute value
    return result ? Math.abs(result.total ?? 0) : 0;
  }

  async getStockByProduct(): Promise<StockByProductItem[]> {
    const rows = await this.manager
      .createQueryBuilder()
      .select([
        'p.id AS product_id',
        'p.name AS product_name',
        'v.id AS variant_id',
        'v.name AS variant_name',
        'v.sku AS sku',
        'COALESCE(SUM(l.remaining_quantity), 0) AS total_remaining_qty',
        'COALESCE(SUM(l.remaining_quantity * l.unit_cost_cents), 0) AS investment_cents',
      ])
      .from('inventory_lots', 'l')
      .innerJoin('variants', 'v', 'v.id = l.variant_id')
      .innerJoin('products', 'p', 'p.id = v.product_id')
      .where('l.remaining_quantity > 0')
      .groupBy('p.id')
      .addGroupBy('p.name')
      .addGroupBy('v.id')
      .addGroupBy('v.name')
      .addGroupBy('v.sku')
      .orderBy('p.name', 'ASC')
      .addOrderBy('v.name', 'ASC')
      .getRawMany();

    return rows.map((r: Record<string, unknown>) => ({
      productId: r.product_id as string,
      productName: r.product_name as string,
      variantId: r.variant_id as string,
      variantName: r.variant_name as string,
      sku: r.sku as string,
      totalRemainingQty: Number(r.total_remaining_qty),
      investmentCents: Number(r.investment_cents),
    }));
  }

  async getLots(): Promise<LotReportItem[]> {
    const rows = await this.manager
      .createQueryBuilder()
      .select([
        'l.id AS lot_id',
        'l.variant_id AS variant_id',
        'l.purchase_date AS purchase_date',
        'l.purchased_quantity AS purchased_quantity',
        'l.remaining_quantity AS remaining_quantity',
        'l.unit_cost_cents AS unit_cost_cents',
      ])
      .from('inventory_lots', 'l')
      .orderBy('l.purchase_date', 'ASC')
      .addOrderBy('l.created_at', 'ASC')
      .getRawMany();

    return rows.map((r: Record<string, unknown>) => {
      const remainingQty = Number(r.remaining_quantity);
      const unitCostCents = Number(r.unit_cost_cents);
      return {
        lotId: r.lot_id as string,
        variantId: r.variant_id as string,
        purchaseDate: r.purchase_date as Date,
        purchasedQuantity: Number(r.purchased_quantity),
        remainingQuantity: remainingQty,
        unitCostCents,
        totalCostCents: remainingQty * unitCostCents,
        status: remainingQty > 0 ? 'OPEN' : 'EXHAUSTED',
      };
    });
  }
}
