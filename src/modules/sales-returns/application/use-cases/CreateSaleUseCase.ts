/**
 * Create Sale use case — records a multi-item sale with FIFO lot
 * consumption and a corresponding positive cash income entry.
 *
 * This runs inside a UnitOfWork transaction to ensure atomicity
 * across inventory lots, sale records, and cash ledger entries.
 *
 * CRITICAL DESIGN: ALL validations (customer, variant, stock) happen
 * BEFORE any mutations. Lot consumption only occurs after every item
 * passes the FIFO allocation check, ensuring atomicity — if a single
 * item fails, no lots have been mutated.
 *
 * Dependencies:
 * - CustomerRepository: validates customer exists
 * - VariantRepository: validates each variant exists
 * - UnitOfWork scope provides: SaleRepository, InventoryLotRepository,
 *   CashLedgerRepository
 */
import { err, ok } from '../../../../shared/domain/Result.js';
import type { Result } from '../../../../shared/domain/Result.js';
import { NotFoundError, BusinessRuleError } from '../../../../shared/domain/errors.js';
import { Money } from '../../../../shared/domain/Money.js';
import type { UnitOfWork } from '../../../../shared/application/UnitOfWork.js';
import type { UnitOfWorkScope } from '../../../../shared/application/UnitOfWork.js';
import type { SaleRepository } from '../../domain/SaleRepository.js';
import type { InventoryLotRepository } from '../../../inventory/domain/InventoryLotRepository.js';
import type { CashLedgerRepository } from '../../../accounting-reports/domain/CashLedgerRepository.js';
import type { CustomerRepository } from '../../../customers/domain/CustomerRepository.js';
import type { VariantRepository } from '../../../inventory/domain/VariantRepository.js';
import { CustomerId } from '../../../customers/domain/CustomerId.js';
import { VariantId } from '../../../inventory/domain/VariantId.js';
import { Sale } from '../../domain/Sale.js';
import { SaleId } from '../../domain/SaleId.js';
import { SaleLine } from '../../domain/SaleLine.js';
import { SaleLineId } from '../../domain/SaleLineId.js';
import { LotConsumptionRecord } from '../../domain/LotConsumptionRecord.js';
import { allocateFifo } from '../../../inventory/domain/services/FifoAllocationService.js';
import type { FifoAllocationResult } from '../../../inventory/domain/services/FifoAllocationService.js';
import { CashLedgerEntry } from '../../../accounting-reports/domain/CashLedgerEntry.js';
import { CashLedgerEntryId } from '../../../accounting-reports/domain/CashLedgerEntryId.js';
import type { PurchaseLot } from '../../../inventory/domain/PurchaseLot.js';

// ── Module-specific scope ────────────────────────────────────

/**
 * Repositories required by CreateSaleUseCase on the UnitOfWork scope.
 */
export interface SaleScope extends UnitOfWorkScope {
  sales: SaleRepository;
  inventoryLots: InventoryLotRepository;
  cashLedger: CashLedgerRepository;
}

// ── DTOs ─────────────────────────────────────────────────────

export interface SaleItemCommand {
  variantId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateSaleCommand {
  customerId: string;
  channelReference: string;
  items: SaleItemCommand[];
}

export interface CreateSaleResponse {
  saleId: string;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
}

// ── Errors ───────────────────────────────────────────────────

export class MissingChannelReferenceError extends BusinessRuleError {
  override readonly name = 'MissingChannelReferenceError' as const;

  constructor() {
    super('Channel reference is required');
  }
}

export class EmptySaleError extends BusinessRuleError {
  override readonly name = 'EmptySaleError' as const;

  constructor() {
    super('Sale must have at least one item');
  }
}

export class InvalidQuantityError extends BusinessRuleError {
  override readonly name = 'InvalidQuantityError' as const;
}

// ── Internal planning type ───────────────────────────────────

/**
 * Planning data collected during the validation phase.
 * Stores the allocation result and the lots to be consumed,
 * so mutations happen only after all items pass validation.
 */
interface ItemPlan {
  variantId: VariantId;
  allocation: FifoAllocationResult;
  lots: PurchaseLot[];
}

// ── Use Case ─────────────────────────────────────────────────

export class CreateSaleUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly variantRepository: VariantRepository,
  ) {}

  /**
   * Execute the sale creation within a UnitOfWork.
   *
   * The UnitOfWorkScope must conform to SaleScope, providing:
   * - scope.sales (SaleRepository)
   * - scope.inventoryLots (InventoryLotRepository)
   * - scope.cashLedger (CashLedgerRepository)
   */
  async execute(
    command: CreateSaleCommand,
    uow: UnitOfWork,
  ): Promise<Result<CreateSaleResponse>> {
    // ── Validate command inputs ────────────────────────────
    if (!command.channelReference || command.channelReference.trim().length === 0) {
      return err(new MissingChannelReferenceError());
    }

    if (command.items.length === 0) {
      return err(new EmptySaleError());
    }

    for (const item of command.items) {
      if (item.quantity <= 0) {
        return err(new InvalidQuantityError('Item quantity must be positive'));
      }
      if (item.unitPriceCents < 0) {
        return err(new InvalidQuantityError('Item unit price cannot be negative'));
      }
    }

    // ── Execute in transaction ────────────────────────────
    return uow.run(async (baseScope) => {
      const scope = baseScope as SaleScope;

      // 1. Validate customer exists
      const customer = await this.customerRepository.findById(CustomerId.from(command.customerId));
      if (!customer) {
        return err(new NotFoundError('Customer', command.customerId));
      }

      const now = new Date();

      // ── PHASE A: Validate all items, collect plans (NO mutations) ──
      const plans: ItemPlan[] = [];

      for (const item of command.items) {
        const variantId = VariantId.from(item.variantId);

        // a) Validate variant exists
        const variant = await this.variantRepository.findById(variantId);
        if (!variant) {
          return err(new NotFoundError('Variant', item.variantId));
        }

        // b) Get open lots with row-level lock
        const lots = await scope.inventoryLots.findByVariantIdOrderedByDate(variantId, true);

        // c) Allocate FIFO — pure function, no mutation
        const allocation = allocateFifo(lots, item.quantity);
        if (!allocation.ok) {
          return err(allocation.error);
        }

        plans.push({ variantId, allocation: allocation.value, lots });
      }

      // ── PHASE B: All validations passed — execute mutations ──
      const lines: SaleLine[] = [];
      const modifiedLotSet = new Set<string>();

      for (const [i, plan] of plans.entries()) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by PHASE A producing one plan per item
        const commandItem = command.items[i]!;

        // Consume lots and create consumption records
        const consumptions: LotConsumptionRecord[] = [];

        for (const selection of plan.allocation.selections) {
          const lot = plan.lots.find((l) => l.id.toString() === selection.lotId);
          if (!lot) continue; // Should never happen

          // MUTATION: reduce remaining quantity on the lot
          const consumptionResult = lot.consume(selection.quantity);
          if (!consumptionResult.ok) {
            return err(consumptionResult.error);
          }

          consumptions.push(
            new LotConsumptionRecord(
              crypto.randomUUID(),
              selection.lotId,
              consumptionResult.value.quantity,
              selection.unitCost,
              selection.subtotal,
            ),
          );
          modifiedLotSet.add(selection.lotId);
        }

        // Create the sale line
        const line = new SaleLine(
          SaleLineId.generate(),
          commandItem.variantId,
          commandItem.quantity,
          Money.fromCents(commandItem.unitPriceCents),
          consumptions,
        );
        lines.push(line);
      }

      // 3. Create the Sale aggregate
      const saleId = SaleId.generate();
      const sale = new Sale(
        saleId,
        command.customerId,
        command.channelReference.trim(),
        lines,
        'ACTIVE',
        now,
        now,
      );

      // 4. Persist sale (cascades to lines and consumptions)
      await scope.sales.save(sale);

      // 5. Persist updated lots (reduced remaining quantities)
      const modifiedLots: PurchaseLot[] = [];
      for (const plan of plans) {
        for (const lot of plan.lots) {
          if (modifiedLotSet.has(lot.id.toString())) {
            modifiedLots.push(lot);
          }
        }
      }
      if (modifiedLots.length > 0) {
        await scope.inventoryLots.saveMany(modifiedLots);
      }

      // 6. Create cash ledger entry (positive income)
      const cashEntry = new CashLedgerEntry(
        CashLedgerEntryId.generate(),
        'SALE_INCOME',
        sale.totalRevenue,
        sale.id.toString(),
        null,
        now,
      );
      await scope.cashLedger.append(cashEntry);

      return ok({
        saleId: sale.id.toString(),
        totalRevenueCents: sale.totalRevenue.cents,
        totalCostCents: sale.totalCost.cents,
        grossProfitCents: sale.grossProfit.cents,
      });
    });
  }
}
