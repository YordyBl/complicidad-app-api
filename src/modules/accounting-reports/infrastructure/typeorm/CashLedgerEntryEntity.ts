/**
 * TypeORM entity for the `cash_ledger_entries` table.
 *
 * Each row represents an immutable entry in the cash ledger.
 * The balance at any point is the sum of all entry amounts.
 */
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'cash_ledger_entries' })
export class CashLedgerEntryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  type!: string;

  /** Amount in integer cents. Positive = income, Negative = outflow. */
  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  /** ID of the source entity (e.g. purchase ID, sale ID). */
  @Column({ name: 'source_id', type: 'varchar', length: 255 })
  sourceId!: string;

  /** Optional tag for categorising entries (e.g. REINVESTMENT, RESTOCK). */
  @Column({ type: 'varchar', length: 50, nullable: true })
  tag!: string | null;
}
