/**
 * Application use case: Get Cash Box Movements.
 *
 * Returns ledger entries for a given cash box in chronological order
 * with optional pagination, type filter, concept search, and date range.
 *
 * Filtering is applied in-memory after fetching from the repository.
 * Future iterations may push filtering to the DB layer for large datasets.
 */
import { type Result, ok, err } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import { CashBoxId } from '../../domain/CashBoxId.js';
import type { CashBoxRepository } from '../../domain/CashBoxRepository.js';
import type { CashLedgerRepository } from '../../domain/CashLedgerRepository.js';

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
      })),
      total,
      page,
      pageSize,
      totalPages,
    });
  }
}
