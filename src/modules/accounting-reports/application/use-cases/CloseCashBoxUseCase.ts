/**
 * Application use case: Close Cash Box.
 *
 * Closes the current OPEN cash box with a final balance.
 * The final balance may differ from currentBalanceCents (reconciliation).
 *
 * Rejects when no open cash box exists.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';

export interface CloseCashBoxCommand {
  /** Final balance in integer cents after reconciliation. */
  finalBalanceCents: number;
}

export interface CloseCashBoxResult {
  id: string;
  status: string;
  finalBalanceCents: number;
  closedAt: Date | null;
}

export class CloseCashBoxUseCase {
  constructor(private readonly cashBoxRepo: CashBoxRepository) {}

  async execute(
    command: CloseCashBoxCommand,
  ): Promise<Result<CloseCashBoxResult, BusinessRuleError>> {
    // 1. Find the current OPEN box
    const box = await this.cashBoxRepo.findCurrent();

    if (!box) {
      return err(
        new BusinessRuleError('No hay una caja abierta para cerrar'),
      );
    }

    // 2. Validate final balance is integer
    if (!Number.isInteger(command.finalBalanceCents)) {
      return err(
        new BusinessRuleError('El saldo final debe ser un número entero de centavos'),
      );
    }

    // 3. Close the box (domain method validates already-closed state)
    try {
      const closed = box.close(command.finalBalanceCents);
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
