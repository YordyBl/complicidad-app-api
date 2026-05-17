/**
 * Application use case: Get Cash Box Movements.
 *
 * Returns ledger entries for a given cash box in chronological order
 * with optional pagination, type filter, concept search, and date range.
 *
 * Filtering is applied in-memory after fetching from the repository.
 * Future iterations may push filtering to the DB layer for large datasets.
 *
 * For SALE_INCOME entries, `profitCents` is resolved via batch lookup
 * of the related Sale (sourceId -> Sale.id -> Sale.grossProfit).
 * Non-sale entries and unresolved sales return `profitCents: null`.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import { CashBoxId } from '../../domain/CashBoxId.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import type { CashLedgerRepository } from '../../domain/CashLedgerRepository.js';
import type { SaleRepository } from '../../../sales-returns/domain/SaleRepository.js';
import { SaleId } from '../../../sales-returns/domain/SaleId.js';
import type { CashLedgerEntry } from '../../domain/CashLedgerEntry.js';

export interface CashBoxMovementsCommand {
  cashBoxId: string;
  /** Page number (1-indexed, default 1). */
  page?: number;
  /** Items per page (default: all items). */
  pageSize?: number;
  /** Filter by entry type (e.g. "SALE_INCOME", "PURCHASE_OUTFLOW"). */
  type?: string;
  /** Search in concept field (case-insensitive substring match). */
  search?: string;
  /** Include entries created at or after this ISO date. */
  from?: string;
  /** Include entries created at or before this ISO date. */
  to?: string;
}

export interface MovementEntryDto {
  id: string;
  type: string;
  amountCents: number;
  sourceId: string;
  concept: string | null;
  createdAt: Date;
  /** Gross profit in cents for real positive SALE_INCOME entries, null otherwise. */
  profitCents: number | null;
}

export interface CashBoxMovementsResult {
  cashBoxId: string;
  businessDate: string;
  status: string;
  entries: MovementEntryDto[];
  /** Total matching entries before pagination. */
  total: number;
  /** Current page (1-indexed). */
  page: number;
  /** Items per page. */
  pageSize: number;
  /** Total pages. */
  totalPages: number;
}

export class GetCashBoxMovementsUseCase {
  constructor(
    private readonly cashBoxRepo: CashBoxRepository,
    private readonly cashLedgerRepo: CashLedgerRepository,
    private readonly saleRepo?: SaleRepository,
  ) {}

  async execute(
    command: CashBoxMovementsCommand,
  ): Promise<Result<CashBoxMovementsResult, NotFoundError>> {
    const box = await this.cashBoxRepo.findById(
      CashBoxId.from(command.cashBoxId),
    );

    if (!box) {
      return err(new NotFoundError('CashBox', command.cashBoxId));
    }

    const allEntries = await this.cashLedgerRepo.findByCashBoxId(command.cashBoxId);

    // ── Apply filters ────────────────────────────────────────
    let filtered = allEntries;

    if (command.type) {
      filtered = filtered.filter((e) => e.type === command.type);
    }

    if (command.search) {
      const term = command.search.toLowerCase();
      filtered = filtered.filter(
        (e) => e.concept?.toLowerCase().includes(term),
      );
    }

    if (command.from) {
      const fromDate = new Date(command.from);
      filtered = filtered.filter((e) => e.createdAt >= fromDate);
    }

    if (command.to) {
      const toDate = new Date(command.to);
      filtered = filtered.filter((e) => e.createdAt <= toDate);
    }

    // ── Apply pagination ─────────────────────────────────────
    const total = filtered.length;
    const page = command.page ?? 1;
    const pageSize = command.pageSize ?? total;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;

    const startIndex = (page - 1) * pageSize;
    const pagedEntries = filtered.slice(startIndex, startIndex + pageSize);

    // ── Batch resolve profitCents only for paged SALE_INCOME entries ───
    const profitMap = await this.resolveProfits(pagedEntries);

    return ok({
      cashBoxId: box.id.toString(),
      businessDate: box.businessDate,
      status: box.status,
      entries: pagedEntries.map((e) => ({
        id: e.id.toString(),
        type: e.type,
        amountCents: e.amount.cents,
        sourceId: e.sourceId,
        concept: e.concept,
        createdAt: e.createdAt,
        profitCents: profitMap.get(e.id.toString()) ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages,
    });
  }

  /**
   * Batch-resolve gross profit for real positive SALE_INCOME entries.
   * Returns a map of entryId -> profitCents | null.
   *
   * Rules:
   * - Non SALE_INCOME entries → null
   * - SALE_INCOME with amountCents <= 0 (reversal/cancellation) → null
   * - SALE_INCOME with amountCents > 0 → lookup Sale by sourceId
   *   - Sale found and ACTIVE → Sale.grossProfit.cents
   *   - Sale not found or not ACTIVE → null
   * - If no saleRepo is wired, all entries return null
   */
  private async resolveProfits(
    entries: CashLedgerEntry[],
  ): Promise<Map<string, number | null>> {
    const profitMap = new Map<string, number | null>();

    // Collect SALE_INCOME entries with positive amounts that can be resolved.
    // Guard against blank/missing sourceIds — EntityId rejects empty strings.
    const resolvableEntries: { entryId: string; sourceId: string }[] = [];

    for (const entry of entries) {
      if (entry.type !== 'SALE_INCOME' || entry.amount.cents <= 0) {
        profitMap.set(entry.id.toString(), null);
      } else if (!this.saleRepo) {
        profitMap.set(entry.id.toString(), null);
      } else if (!entry.sourceId || entry.sourceId.trim().length === 0) {
        // Missing/blank sourceId cannot be resolved — skip lookup
        profitMap.set(entry.id.toString(), null);
      } else {
        resolvableEntries.push({
          entryId: entry.id.toString(),
          sourceId: entry.sourceId,
        });
      }
    }

    if (resolvableEntries.length === 0) {
      return profitMap;
    }

    // saleRepo is guaranteed truthy when resolvableEntries is non-empty
    // (the loop above only pushes to resolvableEntries when saleRepo is
    // truthy), but TypeScript cannot narrow across loop iterations.
    const saleRepo = this.saleRepo;
    if (!saleRepo) return profitMap;

    const saleIds = resolvableEntries.map((r) => SaleId.from(r.sourceId));
    const sales = await saleRepo.findByIds(saleIds);
    const saleBySourceId = new Map(sales.map((s) => [s.id.toString(), s]));

    for (const { entryId, sourceId } of resolvableEntries) {
      const sale = saleBySourceId.get(sourceId);
      if (sale?.status === 'ACTIVE') {
        profitMap.set(entryId, sale.grossProfit.cents);
      } else {
        profitMap.set(entryId, null);
      }
    }

    return profitMap;
  }
}
