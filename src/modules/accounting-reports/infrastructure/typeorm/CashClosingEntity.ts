/**
 * TypeORM entity for the `cash_closings` table.
 *
 * Each row represents a manual cash closing snapshot.
 */
import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../infrastructure/typeorm/BaseEntity.js';

@Entity({ name: 'cash_closings' })
export class CashClosingEntity extends BaseEntity {
  /** The cash ledger balance at the time of closing (integer cents). */
  @Column({ name: 'liquidity_cents', type: 'int' })
  liquidityCents!: number;

  /** Optional notes for this closing. */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** Business timestamp when the closing was performed. */
  @Column({ name: 'closed_at', type: 'timestamptz' })
  closedAt!: Date;
}
