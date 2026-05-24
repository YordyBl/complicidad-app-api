/**
 * Create Sale Constancia Emission use case.
 *
 * Builds a frozen snapshot from enriched sale detail data,
 * determines the next emission number, persists the emission,
 * and returns emission metadata for the client.
 */
import { randomUUID } from 'crypto';
import { ok, err, type Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { SaleConstanciaEmissionRepository } from '../ports/SaleConstanciaEmissionRepository.js';
import { buildConstanciaSnapshot, type ConstanciaSnapshotInput } from './buildConstanciaSnapshot.js';

// ── Command ──────────────────────────────────────────────────

export interface CreateSaleConstanciaEmissionCommand {
  saleId: string;
  /** Enriched sale detail data required for the snapshot. */
  saleData: ConstanciaSnapshotInput;
}

// ── Response ─────────────────────────────────────────────────

export interface CreateSaleConstanciaEmissionResponse {
  id: string;
  saleId: string;
  emissionNumber: number;
  issuedAt: string;
  templateVersion: string;
}

// ── Sale existence check port ─────────────────────────────────

export interface SaleExistenceChecker {
  findById(id: string): Promise<unknown>;
}

// ── Use Case ─────────────────────────────────────────────────

export class CreateSaleConstanciaEmissionUseCase {
  constructor(
    private readonly emissionRepository: SaleConstanciaEmissionRepository,
    private readonly saleRepository: SaleExistenceChecker,
  ) {}

  async execute(
    command: CreateSaleConstanciaEmissionCommand,
  ): Promise<Result<CreateSaleConstanciaEmissionResponse>> {
    // Verify sale exists
    const sale = await this.saleRepository.findById(command.saleId);
    if (!sale) {
      return err(new NotFoundError('Sale', command.saleId));
    }

    // Determine next emission number
    const count = await this.emissionRepository.countBySaleId(command.saleId);
    const emissionNumber = count + 1;

    // Build immutable snapshot
    const snapshot = buildConstanciaSnapshot(command.saleData);

    // Persist
    const id = randomUUID();
    const now = new Date();

    await this.emissionRepository.save({
      id,
      saleId: command.saleId,
      emissionNumber,
      issuedAt: now,
      templateVersion: snapshot.templateVersion,
      snapshotJson: snapshot as unknown as Record<string, unknown>,
    });

    return ok({
      id,
      saleId: command.saleId,
      emissionNumber,
      issuedAt: now.toISOString(),
      templateVersion: snapshot.templateVersion,
    });
  }
}
