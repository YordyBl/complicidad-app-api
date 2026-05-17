/**
 * Application use case: Get Current Cash Box.
 *
 * Returns the current OPEN cash box with a live ledger-derived
 * currentBalanceCents, or a NotFoundError if none exists.
 *
 * The snapshot currentBalanceCents on the CashBox aggregate is ignored;
 * the live balance is computed as openingBalanceCents + sum(ledger entries)
 * so withdrawals and other movements are always reflected without
 * requiring per-writer snapshot updates.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import type { CashLedgerRepository } from '../../domain/CashLedgerRepository.js';

export interface CashBoxResult {
  id: string;
  businessDate: string;
  status: string;
  openingBalanceCents: number;
  currentBalanceCents: number;
  finalBalanceCents: number | null;
  closedAt: Date | null;
  legacy: boolean;
  createdAt: Date;
  isCurrent: boolean;
}

export class GetCurrentCashBoxUseCase {
  constructor(
    private readonly cashBoxRepo: CashBoxRepository,
    private readonly cashLedgerRepo: CashLedgerRepository,
  ) {}

  async execute(): Promise<Result<CashBoxResult, NotFoundError>> {
    const box = await this.cashBoxRepo.findCurrent();

    if (!box) {
      return err(new NotFoundError('CashBox', 'abierta'));
    }

    // Compute live balance: openingBalanceCents + sum of all ledger entries
    const entries = await this.cashLedgerRepo.findByCashBoxId(box.id.toString());
    const sumCents = entries.reduce((sum, e) => sum + e.amount.cents, 0);
    const currentBalanceCents = box.openingBalanceCents + sumCents;

    return ok({
      id: box.id.toString(),
      businessDate: box.businessDate,
      status: box.status,
      openingBalanceCents: box.openingBalanceCents,
      currentBalanceCents,
      finalBalanceCents: box.finalBalanceCents,
      closedAt: box.closedAt,
      legacy: box.legacy,
      createdAt: box.createdAt,
      isCurrent: true,
    });
  }
}
