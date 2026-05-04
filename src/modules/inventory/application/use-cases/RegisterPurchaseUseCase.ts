/**
 * Register Purchase use case — records a stock receipt and creates
 * FIFO lots with a corresponding negative cash outflow entry.
 *
 * This runs inside a UnitOfWork transaction to ensure atomicity
 * across inventory lots and cash ledger entries.
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError, BusinessRuleError } from '../../../../shared/domain/errors.js';
import { Money } from '../../../../shared/domain/Money.js';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { UnitOfWorkScope } from '../../../../shared/application/UnitOfWork.js';
import type { InventoryLotRepository } from '../../domain/InventoryLotRepository.js';
import type { PurchaseRepository } from '../../domain/PurchaseRepository.js';
import type { CashLedgerRepository } from '../../../accounting-reports/domain/CashLedgerRepository.js';
import { Purchase } from '../../domain/Purchase.js';
import { PurchaseId } from '../../domain/PurchaseId.js';
import { PurchaseLot } from '../../domain/PurchaseLot.js';
import { PurchaseLotId } from '../../domain/PurchaseLotId.js';
import { VariantId } from '../../domain/VariantId.js';
import { SupplierId } from '../../domain/SupplierId.js';
import type { VariantRepository } from '../../domain/VariantRepository.js';
import { CashLedgerEntry } from '../../../accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../accounting-reports/domain/CashLedgerEntryId.js';

// ── Module-specific scope ────────────────────────────────────

/**
 * Repositories required by RegisterPurchaseUseCase on the UnitOfWork scope.
 * The TypeORM-backed implementation provides these when wired up.
 */
export interface PurchaseScope extends UnitOfWorkScope {
  inventoryLots: InventoryLotRepository;
  purchases: PurchaseRepository;
  cashLedger: CashLedgerRepository;
}

// ── DTOs ─────────────────────────────────────────────────────

export interface RegisterPurchaseCommand {
  variantId: string;
  quantity: number;
  /** Unit cost in soles (e.g. 50.25). Converted to cents internally. */
  unitCost: number;
  supplierId?: string;
  notes?: string;
  purchaseDate?: string; // ISO date string
}

export interface RegisterPurchaseResponse {
  purchaseId: string;
  lotId: string;
  totalCost: number; // in soles
}

// ── Error ────────────────────────────────────────────────────

export class InvalidQuantityError extends BusinessRuleError {
  override readonly name = 'InvalidQuantityError' as const;
}

// ── Use Case ─────────────────────────────────────────────────

export class RegisterPurchaseUseCase {
  constructor(
    private readonly variantRepository: VariantRepository,
  ) {}

  /**
   * Execute the purchase registration within a UnitOfWork.
   *
   * The UnitOfWorkScope must conform to PurchaseScope, providing:
   * - scope.inventoryLots (InventoryLotRepository)
   * - scope.purchases (PurchaseRepository)
   * - scope.cashLedger (CashLedgerRepository)
   */
  async execute(
    command: RegisterPurchaseCommand,
    uow: UnitOfWork,
  ): Promise<Result<RegisterPurchaseResponse>> {
    // ── Validate input ────────────────────────────────────
    if (command.quantity <= 0) {
      return err(new InvalidQuantityError('Quantity must be positive'));
    }
    if (command.unitCost < 0) {
      return err(new InvalidQuantityError('Unit cost cannot be negative'));
    }

    // Convert soles to cents (internal representation)
    const unitCostCents = Math.round(command.unitCost * 100);

    // ── Execute in transaction ────────────────────────────
    return uow.run(async (baseScope) => {
      const scope = baseScope as PurchaseScope;

      // 1. Validate variant exists
      const variantId = VariantId.from(command.variantId);
      const variant = await this.variantRepository.findById(variantId);
      if (!variant) {
        return err(new NotFoundError('Variant', command.variantId));
      }

      // 2. Create purchase
      const now = new Date();
      const purchaseDate = command.purchaseDate
        ? new Date(command.purchaseDate)
        : now;

      const purchaseId = PurchaseId.generate();
      const purchase = new Purchase(
        purchaseId,
        command.supplierId ? SupplierId.from(command.supplierId) : null,
        command.notes ?? null,
        purchaseDate,
        now,
      );

      // 3. Create FIFO lot
      const lotId = PurchaseLotId.generate();
      const lot = new PurchaseLot(
        lotId,
        variantId,
        purchaseId,
        command.quantity,
        command.quantity,
        Money.fromCents(unitCostCents),
        purchaseDate,
        command.supplierId ? SupplierId.from(command.supplierId) : null,
      );

      // 4. Persist purchase and lot
      await scope.purchases.save(purchase);
      await scope.inventoryLots.save(lot);

      // 5. Create cash ledger entry (negative outflow representing reinvestment)
      const totalCost = Money.fromCents(unitCostCents).multiply(command.quantity);
      const cashEntry = new CashLedgerEntry(
        CashLedgerEntryId.generate(),
        'PURCHASE_OUTFLOW',
        totalCost.negate(), // negative: money leaving the business
        purchaseId.toString(),
        'REINVESTMENT',
        now,
      );
      await scope.cashLedger.append(cashEntry);

      return ok({
        purchaseId: purchaseId.toString(),
        lotId: lotId.toString(),
        totalCost: totalCost.cents / 100,
      });
    });
  }
}
