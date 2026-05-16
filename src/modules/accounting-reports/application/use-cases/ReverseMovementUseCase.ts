/**
 * Application use case: Reverse Movement.
 *
 * Appends an opposite reversal entry for an existing cash ledger movement.
 * The original entry remains unchanged — a new entry with the same type
 * and negated amount is appended.
 *
 * Rejects if the movement is not found, if it has no associated cash box
 * (legacy entry), or if its cash box is already closed.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { NotFoundError, BusinessRuleError } from '../../../../shared/domain/errors.js';
import { CashLedgerEntry } from '../../domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../domain/CashLedgerEntryId.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import type { CashLedgerRepository } from '../../domain/CashLedgerRepository.js';

export interface ReverseMovementCommand {
  movementId: string;
}

export interface ReverseMovementResult {
  id: string;
  reversedId: string;
  type: string;
  amountCents: number;
}

export class ReverseMovementUseCase {
  constructor(
    private readonly cashBoxRepo: CashBoxRepository,
    private readonly cashLedgerRepo: CashLedgerRepository,
  ) {}

  async execute(
    command: ReverseMovementCommand,
  ): Promise<Result<ReverseMovementResult, NotFoundError | BusinessRuleError>> {
    // 1. Load the original entry
    const entryId = CashLedgerEntryId.from(command.movementId);
    const original = await this.cashLedgerRepo.findById(entryId);

    if (!original) {
      return err(new NotFoundError('CashLedgerEntry', command.movementId));
    }

    // 2. Verify entry has an associated cash box (not legacy)
    if (!original.cashBoxId) {
      return err(
        new BusinessRuleError(
          'No se puede revertir un movimiento que no pertenece a una caja',
        ),
      );
    }

    // 3. Verify the cash box is still open
    const box = await this.cashBoxRepo.findById(original.cashBoxId);

    if (!box || box.isClosed()) {
      return err(
        new BusinessRuleError(
          'No se puede revertir un movimiento de una caja cerrada',
        ),
      );
    }

    // 4. Create opposite entry
    const now = new Date();
    const originalConcept = original.concept
      ? `Reversión: ${original.concept}`
      : `Reversión de movimiento ${original.id.toString()}`;

    const reversal = new CashLedgerEntry(
      CashLedgerEntryId.generate(),
      original.type,
      original.amount.negate(),
      original.sourceId,
      null,
      now,
      box.id,
      originalConcept,
    );

    await this.cashLedgerRepo.append(reversal);

    return ok({
      id: reversal.id.toString(),
      reversedId: original.id.toString(),
      type: reversal.type,
      amountCents: reversal.amount.cents,
    });
  }
}
