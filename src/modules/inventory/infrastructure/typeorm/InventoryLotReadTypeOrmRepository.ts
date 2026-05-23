/**
 * TypeORM-backed implementation of the InventoryLotReadRepository port.
 *
 * Performs JOIN queries across inventory_lots, variants, and products
 * to build the canonical lot read model for the frontend lots view.
 *
 * Computes lot state (INTACT/HISTORICAL/EXHAUSTED) and allowedAction
 * by batch-checking consumption records and adjustment records.
 */
import { type EntityManager } from 'typeorm';
import { ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import type {
  InventoryLotReadRepository,
  InventoryLotsResponse,
  InventoryLotRow,
} from '../../application/use-cases/ListInventoryLotsUseCase.js';
import { InventoryLotEntity } from './InventoryLotEntity.js';

// ── Raw JOIN row shape ───────────────────────────────────────

interface LotJoinRow {
  lot_id: string;
  lot_variant_id: string;
  lot_purchase_id: string;
  lot_purchased_quantity: number;
  lot_remaining_quantity: number;
  lot_unit_cost_cents: number;
  lot_purchase_date: Date;
  lot_supplier_id: string | null;
  variant_id: string;
  variant_sku: string;
  variant_attributes: Record<string, string>;
  variant_is_active: boolean;
  product_id: string;
  product_name: string;
}

export class InventoryLotReadTypeOrmRepository implements InventoryLotReadRepository {
  constructor(private readonly manager: EntityManager) {}

  async listLots(filters: {
    productId?: string;
    variantId?: string;
  }): Promise<Result<InventoryLotsResponse>> {
    const lotRepo = this.manager.getRepository(InventoryLotEntity);
    const qb = lotRepo
      .createQueryBuilder('lot')
      .leftJoin('lot.variant', 'variant')
      .leftJoin('variant.product', 'product')
      .select([
        'lot.id',
        'lot.variantId',
        'lot.purchaseId',
        'lot.purchasedQuantity',
        'lot.remainingQuantity',
        'lot.unitCostCents',
        'lot.purchaseDate',
        'lot.supplierId',
        'variant.id',
        'variant.sku',
        'variant.attributes',
        'variant.isActive',
        'product.id',
        'product.name',
      ]);

    if (filters.productId) {
      qb.andWhere('product.id = :productId', { productId: filters.productId });
    }
    if (filters.variantId) {
      qb.andWhere('variant.id = :variantId', { variantId: filters.variantId });
    }

    qb.orderBy('variant.sku', 'ASC').addOrderBy('lot.purchaseDate', 'ASC');

    const rows: LotJoinRow[] = await qb.getRawMany();

    // ── Batch-check consumption and adjustment records ──────
    const lotIds = [...new Set(rows.map((r) => r.lot_id))];
    const [lotsWithConsumption, lotsWithAdjustments] = await Promise.all([
      this.batchHasConsumptionRecords(lotIds),
      this.batchHasAdjustmentRecords(lotIds),
    ]);

    // ── Build response ──────────────────────────────────────
    const product = this.resolveProduct(rows, filters.productId);
    const variants = this.groupByVariant(rows, lotsWithConsumption, lotsWithAdjustments);

    return ok({ product, variants });
  }

  // ── Batch helpers ─────────────────────────────────────────

  /**
   * Return the set of lot IDs that have at least one consumption record
   * (sale, return, cancellation) referencing them.
   */
  private async batchHasConsumptionRecords(lotIds: string[]): Promise<Set<string>> {
    if (lotIds.length === 0) return new Set();
    const result: { purchase_lot_id: string }[] = await this.manager.query(
      'SELECT DISTINCT purchase_lot_id FROM lot_consumption_records WHERE purchase_lot_id = ANY($1)',
      [lotIds],
    );
    return new Set(result.map((r) => r.purchase_lot_id));
  }

  /**
   * Return the set of lot IDs that have at least one corrective adjustment record
   * referencing them.
   *
   * Initial creation INCREASE adjustments (before_quantity = 0) are EXCLUDED
   * because they are the audit trail of lot creation itself, not a corrective
   * action that should make the lot historical.
   */
  private async batchHasAdjustmentRecords(lotIds: string[]): Promise<Set<string>> {
    if (lotIds.length === 0) return new Set();
    const result: { lot_id: string }[] = await this.manager.query(
      `SELECT DISTINCT lot_id FROM inventory_lot_adjustments
       WHERE lot_id = ANY($1)
       AND NOT (action = 'INCREASE' AND before_quantity = 0)`,
      [lotIds],
    );
    return new Set(result.map((r) => r.lot_id));
  }

  // ── Response builders ─────────────────────────────────────

  private resolveProduct(
    rows: LotJoinRow[],
    requestedProductId?: string,
  ): { id: string; name: string } | null {
    if (requestedProductId && rows.length > 0) {
      const first = rows[0];
      if (first) {
        return { id: first.product_id, name: first.product_name };
      }
    }
    if (!requestedProductId && rows.length > 0) {
      // When not filtering, derive from the first row's data
      const productIds = new Set(rows.map((r) => r.product_id));
      if (productIds.size === 1) {
        const first = rows[0];
        if (first) {
          return { id: first.product_id, name: first.product_name };
        }
      }
    }
    return null;
  }

  private groupByVariant(
    rows: LotJoinRow[],
    lotsWithConsumption: Set<string>,
    lotsWithAdjustments: Set<string>,
  ): InventoryLotsResponse['variants'] {
    const variantMap = new Map<
      string,
      {
        variantId: string;
        sku: string;
        attributes: Record<string, string>;
        lots: LotJoinRow[];
      }
    >();

    for (const row of rows) {
      let entry = variantMap.get(row.variant_id);
      if (!entry) {
        entry = {
          variantId: row.variant_id,
          sku: row.variant_sku,
          attributes: row.variant_attributes,
          lots: [],
        };
        variantMap.set(row.variant_id, entry);
      }
      entry.lots.push(row);
    }

    return [...variantMap.values()].map((entry) => {
      const lotRows = entry.lots.map((row) => this.toLotRow(row, lotsWithConsumption, lotsWithAdjustments));
      const stock = lotRows.reduce((sum, l) => sum + l.remainingQuantity, 0);
      return {
        variantId: entry.variantId,
        sku: entry.sku,
        attributes: entry.attributes,
        stock,
        lots: lotRows,
      };
    });
  }

  private toLotRow(
    row: LotJoinRow,
    lotsWithConsumption: Set<string>,
    lotsWithAdjustments: Set<string>,
  ): InventoryLotRow {
    const hasConsumption = lotsWithConsumption.has(row.lot_id);
    const hasAdjustments = lotsWithAdjustments.has(row.lot_id);
    const state = this.computeState(
      row.lot_remaining_quantity,
      row.lot_purchased_quantity,
      hasConsumption,
      hasAdjustments,
    );
    const allowedAction = this.computeAllowedAction(state);

    return {
      lotId: row.lot_id,
      variantId: row.variant_id,
      productId: row.product_id,
      productName: row.product_name,
      sku: row.variant_sku,
      attributes: row.variant_attributes,
      purchasedQuantity: row.lot_purchased_quantity,
      remainingQuantity: row.lot_remaining_quantity,
      unitCost: row.lot_unit_cost_cents / 100,
      purchaseDate: row.lot_purchase_date.toISOString(),
      state,
      allowedAction,
      ...(state === 'HISTORICAL'
        ? { reasonHint: hasAdjustments ? 'Tiene ajustes previos' : 'Tiene consumo registrado' }
        : {}),
    };
  }

  private computeState(
    remaining: number,
    purchased: number,
    hasConsumption: boolean,
    hasAdjustments: boolean,
  ): 'INTACT' | 'HISTORICAL' | 'EXHAUSTED' {
    if (remaining <= 0) return 'EXHAUSTED';

    const isIntact =
      !hasConsumption &&
      !hasAdjustments &&
      remaining === purchased;

    return isIntact ? 'INTACT' : 'HISTORICAL';
  }

  private computeAllowedAction(
    state: 'INTACT' | 'HISTORICAL' | 'EXHAUSTED',
  ): 'edit' | 'compensate' | 'none' {
    switch (state) {
      case 'INTACT':
        return 'edit';
      case 'HISTORICAL':
        return 'compensate';
      case 'EXHAUSTED':
        return 'none';
    }
  }
}
