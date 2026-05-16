/**
 * Application use case: Open Cash Box.
 *
 * Opens today's daily caja. The opening balance is inherited from
 * the last closed box's final balance, or 0 if no prior box exists.
 *
 * Rejects with a business error if a box already exists for the
 * given business date (regardless of status).
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import { CashBox } from '../../domain/CashBox.js';
import { CashBoxId } from '../../domain/CashBoxId.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';

export interface OpenCashBoxCommand {
  /** YYYY-MM-DD business date (America/Lima). */
  businessDate: string;
}

export interface OpenCashBoxResult {
  id: string;
  businessDate: string;
  status: string;
  openingBalanceCents: number;
}

export class OpenCashBoxUseCase {
  constructor(private readonly cashBoxRepo: CashBoxRepository) {}

  async execute(
    command: OpenCashBoxCommand,
  ): Promise<Result<OpenCashBoxResult, BusinessRuleError>> {
    const { businessDate } = command;

    // 1. Check if a box already exists for this date
    const existing = await this.cashBoxRepo.findByBusinessDate(businessDate);
    if (existing) {
      return err(
        new BusinessRuleError(
          `Ya existe una caja para la fecha ${businessDate}`,
        ),
      );
    }

    // 2. Determine opening balance from last closed box
    const lastClosed = await this.cashBoxRepo.findLastClosed();
    const openingBalanceCents = lastClosed?.finalBalanceCents ?? 0;

    // 3. Create and persist the new OPEN box
    const now = new Date();
    const box = new CashBox({
      id: CashBoxId.generate(),
      businessDate,
      status: 'OPEN',
      openingBalanceCents,
      currentBalanceCents: openingBalanceCents,
      finalBalanceCents: null,
      closedAt: null,
      legacy: false,
      createdAt: now,
    });

    await this.cashBoxRepo.save(box);

    return ok({
      id: box.id.toString(),
      businessDate: box.businessDate,
      status: box.status,
      openingBalanceCents: box.openingBalanceCents,
    });
  }
}
