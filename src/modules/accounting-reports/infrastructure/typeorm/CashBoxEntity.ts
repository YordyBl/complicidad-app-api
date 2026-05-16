/**
 * TypeORM entity for the `cash_boxes` table.
 *
 * Each row represents one business day's cash box. A cash box is
 * either OPEN (current day, accepting movements) or CLOSED (finalized).
 *
 * Invariants:
 * - businessDate is unique — one cash box per Lima business day
 * - CLOSED boxes have finalBalanceCents and closedAt set
 * - OPEN boxes have finalBalanceCents = null and closedAt = null
 */
import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'cash_boxes' })
@Index('idx_cash_boxes_business_date', ['businessDate'], { unique: true })
export class CashBoxEntity extends BaseEntity {
  /** YYYY-MM-DD business date in America/Lima timezone. */
  @Column({ name: 'business_date', type: 'date' })
  businessDate!: string;

  /** Current status: OPEN or CLOSED. */
  @Column({ type: 'varchar', length: 10 })
  status!: string;

  /** Opening balance in integer cents (start of day). */
  @Column({ name: 'opening_balance_cents', type: 'int' })
  openingBalanceCents!: number;

  /** Current balance in integer cents (accumulated movements). */
  @Column({ name: 'current_balance_cents', type: 'int' })
  currentBalanceCents!: number;

  /** Final balance in integer cents when closed, or null if open. */
  @Column({ name: 'final_balance_cents', type: 'int', nullable: true })
  finalBalanceCents!: number | null;

  /** Timestamp when the box was closed, or null if open. */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  /** True if this box was created during legacy backfill. */
  @Column({ type: 'boolean', default: false })
  legacy!: boolean;
}
