/**
 * List Sale Constancia Emissions use case.
 *
 * Returns all emissions for a given sale, ordered by most
 * recent first (emission number descending).
 */
import { ok, type Result } from '../../../../shared/domain/Result.js';
import type { SaleConstanciaEmissionRepository } from '../ports/SaleConstanciaEmissionRepository.js';

// ── Command ──────────────────────────────────────────────────

export interface ListSaleConstanciaEmissionsCommand {
  saleId: string;
}

// ── Response ─────────────────────────────────────────────────

export interface SaleConstanciaEmissionSummary {
  id: string;
  emissionNumber: number;
  issuedAt: string;
  templateVersion: string;
}

// ── Use Case ─────────────────────────────────────────────────

export class ListSaleConstanciaEmissionsUseCase {
  constructor(
    private readonly emissionRepository: SaleConstanciaEmissionRepository,
  ) {}

  async execute(
    command: ListSaleConstanciaEmissionsCommand,
  ): Promise<Result<SaleConstanciaEmissionSummary[]>> {
    const records = await this.emissionRepository.findBySaleId(command.saleId);

    const summaries: SaleConstanciaEmissionSummary[] = records.map((r) => ({
      id: r.id,
      emissionNumber: r.emissionNumber,
      issuedAt: r.issuedAt.toISOString(),
      templateVersion: r.templateVersion,
    }));

    return ok(summaries);
  }
}
