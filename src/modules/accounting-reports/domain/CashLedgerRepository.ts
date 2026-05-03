/**
 * Repository port for CashLedgerEntry persistence.
 *
 * Defined in the domain layer so use cases depend on an interface.
 */
import type { CashLedgerEntry } from './CashLedgerEntry.js';

export interface CashLedgerRepository {
  /** Append an entry to the cash ledger. */
  append(entry: CashLedgerEntry): Promise<void>;

  /** Find all entries ordered by creation date ascending. */
  findAllOrdered(): Promise<CashLedgerEntry[]>;
}
