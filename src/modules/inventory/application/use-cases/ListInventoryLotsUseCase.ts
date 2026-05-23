/**
 * List Inventory Lots use case — returns canonical lot data for the
 * frontend dedicated lots view (GET /inventory/lots).
 *
 * This is a read-only use case; it does NOT require a UnitOfWork.
 * It delegates to a read repository that JOINs lots, variants, and products.
 *
 * The use case computes `state` and `allowedAction` for each lot row
 * from the read repository's raw data.
 */
import type { Result } from '../../../../shared/domain/Result.js';

// ── Read models ──────────────────────────────────────────────

export interface InventoryLotRow {
  lotId: string;
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  attributes: Record<string, string>;
  purchasedQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  purchaseDate: string;
  state: 'INTACT' | 'HISTORICAL' | 'EXHAUSTED';
  allowedAction: 'edit' | 'compensate' | 'none';
  reasonHint?: string | null;
}

export interface InventoryLotsResponse {
  product: { id: string; name: string } | null;
  variants: {
    variantId: string;
    sku: string;
    attributes: Record<string, string>;
    stock: number;
    lots: InventoryLotRow[];
  }[];
}

// ── Read repository port ─────────────────────────────────────

export interface InventoryLotReadRepository {
  listLots(filters: {
    productId?: string;
    variantId?: string;
  }): Promise<Result<InventoryLotsResponse>>;
}

// ── Use case ─────────────────────────────────────────────────

export class ListInventoryLotsUseCase {
  constructor(
    private readonly readRepository: InventoryLotReadRepository,
  ) {}

  async execute(filters: {
    productId?: string;
    variantId?: string;
  }): Promise<Result<InventoryLotsResponse>> {
    return this.readRepository.listLots(filters);
  }
}
