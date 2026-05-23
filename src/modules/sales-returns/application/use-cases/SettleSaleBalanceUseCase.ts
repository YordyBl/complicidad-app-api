/**
 * Settle Sale Balance use case — collects the full remaining balance
 * of a partially or zero-paid sale in a single later transaction.
 *
 * CRITICAL DESIGN:
 * - One-time settlement: after settlement the sale is fully paid and
 *   cannot be settled again.
 * - Requires an open cash box for today (settlement day).
 * - Creates a SALE_SETTLEMENT_INCOME cash entry for the pending amount,
 *   scoped to the current cash box. This ensures the cash box on the
 *   collection day reflects the actual cash received.
 * - Only allowed for sales with paymentStatus 'pending' or 'partial'.
 * - Two-phase execution: Phase A validates all conditions (sale exists,
 *   status is ACTIVE, payment is not yet paid, pendingBalance > 0,
 *   open cash box exists) BEFORE Phase B executes mutation.
 *
 * Dependencies:
 * - UnitOfWork scope provides: SaleRepository, CashLedgerRepository,
 *   CashBoxRepository
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError, BusinessRuleError } from '../../../../shared/domain/errors.js';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { UnitOfWorkScope } from '../../../../shared/application/UnitOfWork.js';
import type { SaleRepository } from '../../domain/SaleRepository.js';
import type { CashLedgerRepository } from '../../../accounting-reports/domain/CashLedgerRepository.js';
import type { CashBoxRepository } from '../../../accounting-reports/domain/CashBoxRepository.js';
import { toLimaBusinessDate } from '../../../accounting-reports/domain/LimaBusinessDate.js';
import { SalePaymentError } from '../../domain/Sale.js';
import { SaleId } from '../../domain/SaleId.js';
import { CashLedgerEntry } from '../../../accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../accounting-reports/domain/CashLedgerEntryId.js';

// ── Module-specific scope ────────────────────────────────────

export interface SettleScope extends UnitOfWorkScope {
  sales: SaleRepository;
  cashLedger: CashLedgerRepository;
  cashBoxes: CashBoxRepository;
}

// ── DTOs ─────────────────────────────────────────────────────

export interface SettleSaleBalanceCommand {
  saleId: string;
}

export interface SettleSaleBalanceResponse {
  saleId: string;
  settledAmountCents: number;
  paymentStatus: 'paid';
}

// ── Use Case ─────────────────────────────────────────────────

export class SettleSaleBalanceUseCase {
  /**
   * Execute the sale balance settlement within a UnitOfWork.
   *
   * The UnitOfWorkScope must conform to SettleScope, providing:
   * - scope.sales (SaleRepository)
   * - scope.cashLedger (CashLedgerRepository)
   * - scope.cashBoxes (CashBoxRepository)
   */
  async execute(
    command: SettleSaleBalanceCommand,
    uow: UnitOfWork,
  ): Promise<Result<SettleSaleBalanceResponse>> {
    return uow.run(async (baseScope) => {
      const scope = baseScope as SettleScope;

      // 0. Enforce open caja for today (settlement day)
      const today = toLimaBusinessDate(new Date());
      const todayBox = await scope.cashBoxes.findByBusinessDate(today);
      if (!todayBox?.isOpen()) {
        return err(new BusinessRuleError('No hay una caja abierta para hoy'));
      }

      // ── PHASE A: Validate all conditions (NO mutations) ──────────

      // 1. Load the sale aggregate
      const saleId = SaleId.from(command.saleId);
      const sale = await scope.sales.findById(saleId);
      if (!sale) {
        return err(new NotFoundError('Sale', command.saleId));
      }

      // 2. Validate sale is ACTIVE (cannot settle cancelled or returned sales)
      if (sale.status !== 'ACTIVE') {
        return err(
          new SalePaymentError(
            `No se puede saldar una venta con estado "${sale.status}"`,
          ),
        );
      }

      // 3. Validate payment is not yet fully paid
      if (sale.paymentStatus === 'paid') {
        return err(new SalePaymentError('La venta ya fue saldada'));
      }

      // 4. Validate there is a positive pending balance
      if (sale.pendingBalance.cents <= 0) {
        return err(new SalePaymentError('La venta no tiene saldo pendiente'));
      }

      // ── PHASE B: All validations passed — execute mutations ──────

      const now = new Date();
      const pendingAmount = sale.pendingBalance;

      // 5. Settle the pending balance (domain invariant: one-time transition)
      sale.settlePendingBalance(now);

      // 6. Persist the updated sale
      await scope.sales.save(sale);

      // 7. Create SALE_SETTLEMENT_INCOME cash entry for the collected balance,
      //    scoped to today's open cash box (collection day)
      const cashEntry = new CashLedgerEntry(
        CashLedgerEntryId.generate(),
        'SALE_SETTLEMENT_INCOME',
        pendingAmount,
        sale.id.toString(),
        null,
        now,
        todayBox.id,
        'Saldo de venta cobrado',
      );
      await scope.cashLedger.append(cashEntry);

      return ok({
        saleId: sale.id.toString(),
        settledAmountCents: pendingAmount.cents,
        paymentStatus: 'paid',
      });
    });
  }
}
