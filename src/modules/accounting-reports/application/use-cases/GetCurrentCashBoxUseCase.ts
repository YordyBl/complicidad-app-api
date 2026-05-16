/**
 * Application use case: Get Current Cash Box.
 *
 * Returns the current OPEN cash box, or a NotFoundError if none exists.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';

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
}

export class GetCurrentCashBoxUseCase {
  constructor(private readonly cashBoxRepo: CashBoxRepository) {}

  async execute(): Promise<Result<CashBoxResult, NotFoundError>> {
    const box = await this.cashBoxRepo.findCurrent();

    if (!box) {
      return err(new NotFoundError('CashBox', 'abierta'));
    }

    return ok({
      id: box.id.toString(),
      businessDate: box.businessDate,
      status: box.status,
      openingBalanceCents: box.openingBalanceCents,
      currentBalanceCents: box.currentBalanceCents,
      finalBalanceCents: box.finalBalanceCents,
      closedAt: box.closedAt,
      legacy: box.legacy,
      createdAt: box.createdAt,
    });
  }
}
