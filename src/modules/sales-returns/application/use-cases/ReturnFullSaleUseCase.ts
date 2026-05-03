/**
 * Return (full sale) use case — marks an active sale as RETURNED, restores
 * exact FIFO lots from stored LotConsumptionRecord data (same as cancellation),
 * and creates a RETURN_OUTFLOW cash ledger entry for reports/accounting.
 *
 * CRITICAL DESIGN:
 * - Does NOT recalculate FIFO — uses existing LotConsumptionRecord exact
 *   lot IDs, quantities, and unit costs.
 * - Runs inside a UnitOfWork transaction for atomicity.
 * - Two-phase execution: Phase A validates all data (sale status, lot
 *   existence) BEFORE Phase B executes any mutations.
 * - Distinct from cancellation: uses RETURN_OUTFLOW cash entry type and
 *   'RETURNED' status, enabling reports to distinguish customer returns
 *   from admin cancellations.
 * - Seam for partial returns: a future PartialReturnUseCase would follow
 *   the same pattern but only select specific lines/consumptions rather
 *   than all of them.
 * - Prevents double return and prevents returning a cancelled sale.
 *
 * Dependencies:
 * - UnitOfWork scope provides: SaleRepository, InventoryLotRepository,
 *   CashLedgerRepository
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { UnitOfWorkScope } from '../../../../shared/application/UnitOfWork.js';
import type { SaleRepository } from '../../domain/SaleRepository.js';
import type { InventoryLotRepository } from '../../../inventory/domain/InventoryLotRepository.js';
import type { CashLedgerRepository } from '../../../accounting-reports/domain/CashLedgerRepository.js';
import { SaleStatusError } from '../../domain/Sale.js';
import { SaleId } from '../../domain/SaleId.js';
import { PurchaseLotId } from '../../../inventory/domain/PurchaseLotId.js';
import { CashLedgerEntry } from '../../../accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../accounting-reports/domain/CashLedgerEntryId.js';

// ── Module-specific scope ────────────────────────────────────

export interface ReturnScope extends UnitOfWorkScope {
  sales: SaleRepository;
  inventoryLots: InventoryLotRepository;
  cashLedger: CashLedgerRepository;
}

// ── DTOs ─────────────────────────────────────────────────────

export interface ReturnFullSaleCommand {
  saleId: string;
}

export interface ReturnFullSaleResponse {
  saleId: string;
}

// ── Use Case ─────────────────────────────────────────────────

export class ReturnFullSaleUseCase {
  /**
   * Execute a full-sale return within a UnitOfWork.
   *
   * The UnitOfWorkScope must conform to ReturnScope, providing:
   * - scope.sales (SaleRepository)
   * - scope.inventoryLots (InventoryLotRepository)
   * - scope.cashLedger (CashLedgerRepository)
   */
  async execute(
    command: ReturnFullSaleCommand,
    uow: UnitOfWork,
  ): Promise<Result<ReturnFullSaleResponse>> {
    return uow.run(async (baseScope) => {
      const scope = baseScope as ReturnScope;

      // ── PHASE A: Validate all conditions (NO mutations) ──────────

      // 1. Load the sale aggregate (lines + consumptions)
      const saleId = SaleId.from(command.saleId);
      const sale = await scope.sales.findById(saleId);
      if (!sale) {
        return err(new NotFoundError('Sale', command.saleId));
      }

      // 2. Validate return is allowed (check without mutating)
      if (sale.status === 'RETURNED') {
        return err(new SaleStatusError('Sale has already been returned'));
      }
      if (sale.status === 'CANCELLED') {
        return err(new SaleStatusError('Cannot return a cancelled sale'));
      }

      // 3. Collect all unique purchase lot IDs from consumption records
      const uniqueLotIds = new Set<string>();
      for (const line of sale.lines) {
        for (const consumption of line.consumptions) {
          uniqueLotIds.add(consumption.purchaseLotId);
        }
      }

      // 4. Load and validate all referenced purchase lots exist
      const lotIds = Array.from(uniqueLotIds).map((id) => PurchaseLotId.from(id));
      const lots = await scope.inventoryLots.findByIds(lotIds);
      const lotMap = new Map(lots.map((l) => [l.id.toString(), l]));

      for (const line of sale.lines) {
        for (const consumption of line.consumptions) {
          if (!lotMap.has(consumption.purchaseLotId)) {
            return err(
              new NotFoundError('PurchaseLot', consumption.purchaseLotId),
            );
          }
        }
      }

      // ── PHASE B: All validations passed — execute mutations ──────

      const now = new Date();

      // 5. Mutate sale status (safe — validated in Phase A)
      sale.markReturned();

      // 6. Restore exact quantities to each lot
      for (const line of sale.lines) {
        for (const consumption of line.consumptions) {
          const lot = lotMap.get(consumption.purchaseLotId);
          if (!lot) {
            return err(new NotFoundError('PurchaseLot', consumption.purchaseLotId));
          }
          lot.restore(consumption.quantity);
        }
      }

      // 7. Persist the sale (with updated status)
      await scope.sales.save(sale);

      // 8. Persist restored lots
      if (lots.length > 0) {
        await scope.inventoryLots.saveMany(lots);
      }

      // 9. Create RETURN_OUTFLOW cash entry (negative — cash leaving the business)
      const cashEntry = new CashLedgerEntry(
        CashLedgerEntryId.generate(),
        'RETURN_OUTFLOW',
        sale.totalRevenue.negate(),
        sale.id.toString(),
        null,
        now,
      );
      await scope.cashLedger.append(cashEntry);

      return ok({ saleId: sale.id.toString() });
    });
  }
}
