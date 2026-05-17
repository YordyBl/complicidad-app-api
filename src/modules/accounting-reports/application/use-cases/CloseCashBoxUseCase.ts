/**
 * Application use case: Close Cash Box.
 *
 * Closes the current OPEN cash box, deriving the final balance from the
 * authoritative cash ledger (openingBalanceCents + sum of all ledger entries).
 * The client-provided finalBalanceCents is NEVER trusted as source of truth.
 *
 * Rejects when no open cash box exists or the box is already closed.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import type { CashLedgerRepository } from '../../domain/CashLedgerRepository.js';

export type CloseCashBoxCommand = Record<string, never>;

export interface CloseCashBoxResult {
  id: string;
  status: string;
  finalBalanceCents: number;
  closedAt: Date | null;
}

export class CloseCashBoxUseCase {
  constructor(
    private readonly cashBoxRepo: CashBoxRepository,
    private readonly cashLedgerRepo: CashLedgerRepository,
  ) {}

  async execute(
    _command: CloseCashBoxCommand,
  ): Promise<Result<CloseCashBoxResult, BusinessRuleError>> {
    // 1. Find the current OPEN box
    const box = await this.cashBoxRepo.findCurrent();

    if (!box) {
      return err(
        new BusinessRuleError('No hay una caja abierta para cerrar'),
      );
    }

    // 2. Derive final balance from the authoritative ledger:
    //    openingBalanceCents + sum of all ledger entries for this box
    const entries = await this.cashLedgerRepo.findByCashBoxId(box.id.toString());
    const sumCents = entries.reduce((sum, e) => sum + e.amount.cents, 0);
    const finalBalanceCents = box.openingBalanceCents + sumCents;

    // 3. Close the box (domain method validates already-closed state)
    try {
      const closed = box.close(finalBalanceCents);
      await this.cashBoxRepo.save(closed);

      return ok({
        id: closed.id.toString(),
        status: closed.status,
        finalBalanceCents: closed.finalBalanceCents ?? 0,
        closedAt: closed.closedAt,
      });
    } catch (error) {
      if (error instanceof BusinessRuleError) {
        return err(error);
      }
      throw error;
    }
  }
}
