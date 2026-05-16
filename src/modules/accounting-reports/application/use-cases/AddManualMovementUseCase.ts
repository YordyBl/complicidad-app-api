/**
 * Application use case: Add Manual Movement.
 *
 * Appends a manual cash movement (MANUAL_ADJUSTMENT or WITHDRAWAL)
 * to today's open cash box with a required concept and amount.
 *
 * Rejects if no cash box is currently open, or if input validation fails.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import { CashLedgerEntry } from '../../domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../domain/CashLedgerEntryId.js';
import { Money } from '../../../../shared/domain/Money.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import type { CashLedgerRepository } from '../../domain/CashLedgerRepository.js';

/** Entry types allowed for manual movements. */
const MANUAL_MOVEMENT_TYPES: ReadonlySet<string> = new Set([
  'MANUAL_ADJUSTMENT',
  'WITHDRAWAL',
]);

export interface AddManualMovementCommand {
  concept: string;
  amountCents: number;
  type: 'MANUAL_ADJUSTMENT' | 'WITHDRAWAL';
}

export interface AddManualMovementResult {
  id: string;
  cashBoxId: string;
  type: string;
  amountCents: number;
  concept: string;
}

export class AddManualMovementUseCase {
  constructor(
    private readonly cashBoxRepo: CashBoxRepository,
    private readonly cashLedgerRepo: CashLedgerRepository,
  ) {}

  async execute(
    command: AddManualMovementCommand,
  ): Promise<Result<AddManualMovementResult, BusinessRuleError>> {
    // ── Validate input ────────────────────────────────────
    if (!command.concept || command.concept.trim().length === 0) {
      return err(new BusinessRuleError('El concepto es obligatorio'));
    }

    if (command.amountCents === 0) {
      return err(new BusinessRuleError('El monto debe ser distinto de cero'));
    }

    if (!MANUAL_MOVEMENT_TYPES.has(command.type)) {
      const valid = Array.from(MANUAL_MOVEMENT_TYPES).join(', ');
      return err(
        new BusinessRuleError(
          `Tipo de movimiento inválido: "${command.type}". Debe ser: ${valid}`,
        ),
      );
    }

    // ── Find current open box ─────────────────────────────
    const box = await this.cashBoxRepo.findCurrent();

    if (!box) {
      return err(new BusinessRuleError('No hay una caja abierta'));
    }

    // ── Append entry ──────────────────────────────────────
    const now = new Date();
    const entry = new CashLedgerEntry(
      CashLedgerEntryId.generate(),
      command.type,
      Money.fromCents(command.amountCents),
      'manual',
      null,
      now,
      box.id,
      command.concept.trim(),
    );

    await this.cashLedgerRepo.append(entry);

    return ok({
      id: entry.id.toString(),
      cashBoxId: box.id.toString(),
      type: entry.type,
      amountCents: entry.amount.cents,
      concept: entry.concept ?? '',
    });
  }
}
