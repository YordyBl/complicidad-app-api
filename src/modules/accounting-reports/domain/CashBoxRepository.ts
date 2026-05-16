/**
 * Repository port for CashBox persistence.
 *
 * Defined in the domain layer so use cases depend on an interface.
 */
import type { CashBox } from './CashBox.js';
import type { CashBoxId } from './CashBoxId.js';

export interface CashBoxRepository {
  /** Persist a new or updated cash box. */
  save(box: CashBox): Promise<void>;

  /** Find the cash box for a given business date (YYYY-MM-DD). */
  findByBusinessDate(businessDate: string): Promise<CashBox | null>;

  /** Find today's OPEN cash box (latest open box for today). */
  findCurrent(): Promise<CashBox | null>;

  /** Find a cash box by its ID. */
  findById(id: CashBoxId): Promise<CashBox | null>;

  /** Find all cash boxes ordered by business date descending. */
  findAllOrdered(): Promise<CashBox[]>;

  /** Find the most recent CLOSED cash box, if any. */
  findLastClosed(): Promise<CashBox | null>;
}
