/**
 * Repository port for CashLedgerEntry persistence.
 *
 * Defined in the domain layer so use cases depend on an interface.
 */
import type { CashLedgerEntry } from './CashLedgerEntry.js';
import type { CashLedgerEntryId } from './CashLedgerEntryId.js';

export interface CashLedgerRepository {
  /** Append an entry to the cash ledger. */
  append(entry: CashLedgerEntry): Promise<void>;

  /** Find an entry by its ID. */
  findById(id: CashLedgerEntryId): Promise<CashLedgerEntry | null>;

  /** Find all entries ordered by creation date ascending. */
  findAllOrdered(): Promise<CashLedgerEntry[]>;

  /** Find all entries scoped to a cash box, ordered by creation date ascending. */
  findByCashBoxId(cashBoxId: string): Promise<CashLedgerEntry[]>;
}
