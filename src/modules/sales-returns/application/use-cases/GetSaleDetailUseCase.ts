/**
 * Get Sale Detail use case — retrieves a single sale with all lines and consumptions.
 *
 * Returns Result<SaleDetailResponse>: Ok with full detail on found, Err with NotFoundError on miss.
 */
import type { SaleRepository } from '../../domain/SaleRepository.js';
import type { Sale } from '../../domain/Sale.js';
import { SaleId } from '../../domain/SaleId.js';
import { ok, err, type Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';

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
}

export interface SaleDetailResponse {
  id: string;
  customerId: string;
  channelReference: string;
  channel: string;
  status: string;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  createdAt: string;
  updatedAt: string;
  lines: SaleDetailLine[];
}

// ── Use Case ─────────────────────────────────────────────────

export class GetSaleDetailUseCase {
  constructor(private readonly saleRepository: SaleRepository) {}

  async execute(command: GetSaleDetailCommand): Promise<Result<SaleDetailResponse>> {
    const saleId = SaleId.from(command.saleId);
    const sale = await this.saleRepository.findById(saleId);

    if (!sale) {
      return err(new NotFoundError('Sale', command.saleId));
    }

    return ok(this.toDetail(sale));
  }

  private toDetail(sale: Sale): SaleDetailResponse {
    return {
      id: sale.id.toString(),
      customerId: sale.customerId,
      channelReference: sale.channelReference,
      channel: sale.channel,
      status: sale.status,
      totalRevenueCents: sale.totalRevenue.cents,
      totalCostCents: sale.totalCost.cents,
      grossProfitCents: sale.grossProfit.cents,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      lines: sale.lines.map((line) => ({
        id: line.id.toString(),
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
      })),
    };
  }
}
