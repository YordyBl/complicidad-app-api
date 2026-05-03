/**
 * Repository port for CashClosing persistence.
 *
 * Defined in the domain layer so use cases depend on an interface.
 */
import type { CashClosing } from './CashClosing.js';

export interface CashClosingRepository {
  /** Persist a new cash closing record. */
  save(closing: CashClosing): Promise<void>;

  /** Find the most recent closing, if any. */
  findLast(): Promise<CashClosing | null>;
}
