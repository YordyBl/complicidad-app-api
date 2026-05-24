/**
 * Get Sale Detail use case — retrieves a single sale with all lines and consumptions.
 *
 * If a SaleDetailReadRepository is wired, the response is enriched with:
 * - Flat customer fields (customerName, customerPhone, customerAddress, customerDistrict)
 * - Human-readable garment display labels (displayLabel, productName, sku, attributes)
 *
 * Returns Result<SaleDetailResponse>: Ok with full detail on found, Err with NotFoundError on miss.
 */
import type { SaleRepository } from '../../domain/SaleRepository.js';
import type { Sale } from '../../domain/Sale.js';
import { SaleId } from '../../domain/SaleId.js';
import { ok, err, type Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { SaleDetailReadRepository, EnrichedSaleDetail } from '../ports/SaleDetailReadRepository.js';

// ── Command ──────────────────────────────────────────────────

export interface GetSaleDetailCommand {
  saleId: string;
}

// ── DTOs ─────────────────────────────────────────────────────

export interface SaleDetailConsumption {
  id: string;
  purchaseLotId: string;
  quantity: number;
  unitCostCents: number;
  subtotalCents: number;
}

export interface SaleDetailLine {
  id: string;
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  priceType: 'regular' | 'presale';
  totalPriceCents: number;
  totalCostCents: number;
  consumptions: SaleDetailConsumption[];
  // Enriched garment display fields (null when reader not wired or data missing)
  displayLabel: string | null;
  productName: string | null;
  sku: string | null;
  attributes: Record<string, string>;
}

export interface SaleDetailResponse {
  id: string;
  customerId: string;
  channelReference: string | null;
  channel: string;
  status: string;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  createdAt: string;
  updatedAt: string;
  lines: SaleDetailLine[];
  // Payment snapshot fields — available when the sale was created with upfront payment
  paymentStatus: 'pending' | 'partial' | 'paid';
  amountPaidCents: number;
  pendingBalanceCents: number;
  settledAt: string | null;
  // Enriched customer fields (null when reader not wired or data missing)
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerDistrict: string | null;
  googleMapsUrl: string | null;
}

// ── Use Case ─────────────────────────────────────────────────

export class GetSaleDetailUseCase {
  constructor(
    private readonly saleRepository: SaleRepository,
    private readonly detailReadRepository?: SaleDetailReadRepository,
  ) {}

  async execute(command: GetSaleDetailCommand): Promise<Result<SaleDetailResponse>> {
    const saleId = SaleId.from(command.saleId);
    const sale = await this.saleRepository.findById(saleId);

    if (!sale) {
      return err(new NotFoundError('Sale', command.saleId));
    }

    // Load enriched data concurrently when the read repository is wired
    const enrichedPromise = this.detailReadRepository
      ? this.detailReadRepository.findBySaleId(command.saleId)
      : null;

    const enriched = await enrichedPromise;

    return ok(this.toDetail(sale, enriched));
  }

  private toDetail(sale: Sale, enriched: EnrichedSaleDetail | null): SaleDetailResponse {
    // Build enriched line lookup for merging
    const enrichedLineMap = new Map(
      (enriched?.lines ?? []).map((el) => [el.lineId, el]),
    );

    return {
      id: sale.id.toString(),
      customerId: sale.customerId,
      channelReference: sale.channelReference ?? null,
      channel: sale.channel,
      status: sale.status,
      totalRevenueCents: sale.totalRevenue.cents,
      totalCostCents: sale.totalCost.cents,
      grossProfitCents: sale.grossProfit.cents,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      lines: sale.lines.map((line) => {
        const lineId = line.id.toString();
        const el = enrichedLineMap.get(lineId);

        return {
          id: lineId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitPriceCents: line.unitPrice.cents,
          priceType: line.priceType,
          totalPriceCents: line.totalPrice.cents,
          totalCostCents: line.totalCost.cents,
          consumptions: line.consumptions.map((c) => ({
            id: c.id,
            purchaseLotId: c.purchaseLotId,
            quantity: c.quantity,
            unitCostCents: c.unitCost.cents,
            subtotalCents: c.subtotal.cents,
          })),
          // Enriched garment display fields
          displayLabel: el?.displayLabel ?? null,
          productName: el?.productName ?? null,
          sku: el?.sku ?? null,
          attributes: el?.attributes ?? {},
        };
      }),
      // Payment snapshot
      paymentStatus: sale.paymentStatus,
      amountPaidCents: sale.amountPaid.cents,
      pendingBalanceCents: sale.pendingBalance.cents,
      settledAt: sale.settledAt ? sale.settledAt.toISOString() : null,
      // Enriched customer fields
      customerName: enriched?.customerName ?? null,
      customerPhone: enriched?.customerPhone ?? null,
      customerAddress: enriched?.customerAddress ?? null,
      customerDistrict: enriched?.customerDistrict ?? null,
      googleMapsUrl: enriched?.googleMapsUrl ?? null,
    };
  }
}
