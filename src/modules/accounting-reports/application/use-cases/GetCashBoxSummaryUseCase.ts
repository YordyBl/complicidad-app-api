/**
 * Application use case: Get Cash Box Summary.
 *
 * Computes gross sales, purchase outflow, return outflow, manual adjustments,
 * withdrawals, net movement, and current balance for a given cash box.
 *
 * The currentBalanceCents stored on the CashBox is a snapshot; the live
 * balance is computed as openingBalanceCents + sum of all ledger entries.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import { CashBoxId } from '../../domain/CashBoxId.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import type { CashLedgerRepository } from '../../domain/CashLedgerRepository.js';

export interface CashBoxSummaryCommand {
  cashBoxId: string;
}

export interface CashBoxSummaryResult {
  cashBoxId: string;
  businessDate: string;
  status: string;
  openingBalanceCents: number;
  currentBalanceCents: number;
  netMovementCents: number;
  grossSalesCents: number;
  purchaseOutflowCents: number;
  returnOutflowCents: number;
  manualAdjustmentsCents: number;
  withdrawalsCents: number;
}

export class GetCashBoxSummaryUseCase {
  constructor(
    private readonly cashBoxRepo: CashBoxRepository,
    private readonly cashLedgerRepo: CashLedgerRepository,
  ) {}

  async execute(
    command: CashBoxSummaryCommand,
  ): Promise<Result<CashBoxSummaryResult, NotFoundError>> {
    const box = await this.cashBoxRepo.findById(
      CashBoxId.from(command.cashBoxId),
    );

    if (!box) {
      return err(new NotFoundError('CashBox', command.cashBoxId));
    }

    const entries = await this.cashLedgerRepo.findByCashBoxId(command.cashBoxId);

    let grossSalesCents = 0;
    let purchaseOutflowCents = 0;
    let returnOutflowCents = 0;
    let manualAdjustmentsCents = 0;
    let withdrawalsCents = 0;

    for (const entry of entries) {
      const amount = entry.amount.cents;
      switch (entry.type) {
        case 'SALE_INCOME':
        case 'SALE_SETTLEMENT_INCOME':
          grossSalesCents += amount;
          break;
        case 'PURCHASE_OUTFLOW':
          purchaseOutflowCents += amount;
          break;
        case 'RETURN_OUTFLOW':
          returnOutflowCents += amount;
          break;
        case 'MANUAL_ADJUSTMENT':
          manualAdjustmentsCents += amount;
          break;
        case 'WITHDRAWAL':
          withdrawalsCents += amount;
          break;
      }
    }

    const signedMovementCents =
      grossSalesCents +
      purchaseOutflowCents +
      returnOutflowCents +
      manualAdjustmentsCents +
      withdrawalsCents;

    const currentBalanceCents = box.openingBalanceCents + signedMovementCents;

    return ok({
      cashBoxId: box.id.toString(),
      businessDate: box.businessDate,
      status: box.status,
      openingBalanceCents: box.openingBalanceCents,
      currentBalanceCents,
      netMovementCents: signedMovementCents,
      grossSalesCents,
      purchaseOutflowCents,
      returnOutflowCents,
      manualAdjustmentsCents,
      withdrawalsCents,
    });
  }
}
