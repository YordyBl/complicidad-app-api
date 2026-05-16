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
import type { CashBoxRepository } from '../../../accounting-reports/domain/CashBoxRepository.js';
import { toLimaBusinessDate } from '../../../accounting-reports/domain/LimaBusinessDate.js';
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
  cashBoxes: CashBoxRepository;
}

// ── DTOs ─────────────────────────────────────────────────────

export interface RegisterPurchaseItem {
  /** Variant identifier (UUID). */
  variantId: string;
  /** Integer quantity of units purchased. */
  quantity: number;
  /** Unit cost in soles (e.g. 50.25). Converted to cents internally. */
  unitCost: number;
}

export interface RegisterPurchaseCommand {
  /** One or more items in this purchase batch. */
  items: RegisterPurchaseItem[];
  supplierId?: string;
  notes?: string;
  purchaseDate?: string; // ISO date string
}

export interface PurchaseLotResponse {
  lotId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface RegisterPurchaseResponse {
  purchaseId: string;
  lots: PurchaseLotResponse[];
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
   * Validates all items upfront — if any item is invalid the entire
   * batch is rejected and nothing is persisted.
   */
  async execute(
    command: RegisterPurchaseCommand,
    uow: UnitOfWork,
  ): Promise<Result<RegisterPurchaseResponse>> {
    // ── Validate input ────────────────────────────────────
    if (command.items.length === 0) {
      return err(new InvalidQuantityError('La compra debe contener al menos un item'));
    }

    for (const item of command.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return err(new InvalidQuantityError('La cantidad debe ser un número entero positivo'));
      }
      if (item.unitCost < 0) {
        return err(new InvalidQuantityError('El costo unitario no puede ser negativo'));
      }
    }

    // ── Execute in transaction ────────────────────────────
    return uow.run(async (baseScope) => {
      const scope = baseScope as PurchaseScope;

      // 1. Validate all variants exist upfront (fail-fast)
      for (const item of command.items) {
        const variant = await this.variantRepository.findById(
          VariantId.from(item.variantId),
        );
        if (!variant) {
          return err(new NotFoundError('Variant', item.variantId));
        }
      }

      // 2. Resolve today's OPEN cash box (enforce caja requirement)
      const todayLima = toLimaBusinessDate(new Date());
      const todayBox = await scope.cashBoxes.findByBusinessDate(todayLima);
      if (!todayBox?.isOpen()) {
        return err(
          new BusinessRuleError(
            'No se puede registrar una compra: la caja del día de hoy no está abierta',
          ),
        );
      }

      // 3. Create purchase
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

      // 3. Create FIFO lots for each item + compute totals
      const lots: PurchaseLot[] = [];
      const lotResponses: PurchaseLotResponse[] = [];
      let totalCents = 0;

      for (const item of command.items) {
        const unitCostCents = Math.round(item.unitCost * 100);
        const lot = new PurchaseLot(
          PurchaseLotId.generate(),
          VariantId.from(item.variantId),
          purchaseId,
          item.quantity,
          item.quantity,
          Money.fromCents(unitCostCents),
          purchaseDate,
          command.supplierId ? SupplierId.from(command.supplierId) : null,
        );
        lots.push(lot);

        const itemTotal = unitCostCents * item.quantity;
        totalCents += itemTotal;
        lotResponses.push({
          lotId: lot.id.toString(),
          variantId: item.variantId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: itemTotal / 100,
        });
      }

      // 4. Persist purchase and all lots
      await scope.purchases.save(purchase);
      await scope.inventoryLots.saveMany(lots);

      // 6. Create single cash ledger entry (total outflow) scoped to open caja
      const totalCost = Money.fromCents(totalCents);
      const cashEntry = new CashLedgerEntry(
        CashLedgerEntryId.generate(),
        'PURCHASE_OUTFLOW',
        totalCost.negate(), // negative: money leaving the business
        purchaseId.toString(),
        'REINVESTMENT',
        now,
        todayBox.id, // scope to today's open cash box
      );
      await scope.cashLedger.append(cashEntry);

      return ok({
        purchaseId: purchaseId.toString(),
        lots: lotResponses,
        totalCost: totalCost.cents / 100,
      });
    });
  }
}
