/**
 * Get Sale Constancia PDF use case.
 *
 * Loads a previously persisted emission by ID and regenerates
 * the PDF from its immutable snapshot. The snapshot guarantees
 * the PDF content matches the original emission regardless of
 * later customer or product data changes.
 */
import { ok, err, type Result } from '../../../../shared/domain/Result.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { SaleConstanciaEmissionRepository } from '../ports/SaleConstanciaEmissionRepository.js';
import type { ConstanciaSnapshot } from './buildConstanciaSnapshot.js';
import { renderConstanciaPdf } from './renderConstanciaPdf.js';

// ── Command ──────────────────────────────────────────────────

export interface GetSaleConstanciaPdfCommand {
  emissionId: string;
}

// ── Response ─────────────────────────────────────────────────

export interface GetSaleConstanciaPdfResponse {
  pdf: Buffer;
  metadata: {
    filename: string;
    contentType: string;
    emissionNumber: number;
  };
}

// ── Use Case ─────────────────────────────────────────────────

export class GetSaleConstanciaPdfUseCase {
  constructor(
    private readonly emissionRepository: SaleConstanciaEmissionRepository,
  ) {}

  async execute(
    command: GetSaleConstanciaPdfCommand,
  ): Promise<Result<GetSaleConstanciaPdfResponse>> {
    const record = await this.emissionRepository.findById(command.emissionId);

    if (!record) {
      return err(new NotFoundError('Emission', command.emissionId));
    }

    const snapshot = record.snapshotJson as unknown as ConstanciaSnapshot;

    const pdf = await renderConstanciaPdf(snapshot);

    // Use record.saleId as fallback when snapshot.saleId is absent
    // (legacy snapshots persisted before saleId was added to the schema).
    const saleIdPrefix = (snapshot.saleId ?? record.saleId).slice(0, 8);

    return ok({
      pdf,
      metadata: {
        filename: `constancia-${saleIdPrefix}-emision-${String(record.emissionNumber)}.pdf`,
        contentType: 'application/pdf',
        emissionNumber: record.emissionNumber,
      },
    });
  }
}
