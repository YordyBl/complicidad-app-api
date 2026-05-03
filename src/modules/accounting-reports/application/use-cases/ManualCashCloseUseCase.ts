/**
 * Application use case: Manual Cash Close.
 *
 * Records a snapshot of the current cash ledger balance as a cash closing.
 * The closing captures what the cash position was at a specific point in time.
 *
 * Future cron compatibility: the core logic (query liquidity + persist closing)
 * is identical for automated closings. Only the trigger mechanism differs.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { BusinessRuleError } from '../../../../shared/domain/errors.js';
import { CashClosing } from '../../domain/CashClosing.js';
import type { CashClosingRepository } from '../../domain/CashClosingRepository.js';
import type { ReportReadRepository } from '../../domain/ReportReadRepository.js';

export interface ManualCashCloseCommand {
  notes?: string | null;
}

export interface ManualCashCloseResult {
  closingId: string;
  liquidityCents: number;
  closedAt: string;
}

export class ManualCashCloseUseCase {
  constructor(
    private readonly reportRepo: ReportReadRepository,
    private readonly closingRepo: CashClosingRepository,
  ) {}

  async execute(
    command: ManualCashCloseCommand,
  ): Promise<Result<ManualCashCloseResult, BusinessRuleError>> {
    const liquidityCents = await this.reportRepo.getLiquidityCents();
    const now = new Date();

    const closing = new CashClosing(
      crypto.randomUUID(),
      liquidityCents,
      command.notes ?? null,
      now,
      now,
    );

    try {
      await this.closingRepo.save(closing);
    } catch (error) {
      return err(
        new BusinessRuleError(
          `Failed to save cash closing: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    return ok({
      closingId: closing.id,
      liquidityCents: closing.liquidityCents,
      closedAt: closing.closedAt.toISOString(),
    });
  }
}
