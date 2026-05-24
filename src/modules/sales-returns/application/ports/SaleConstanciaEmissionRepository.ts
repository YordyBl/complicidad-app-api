/**
 * Port for persisting and querying sale constancia emissions.
 *
 * Defined in the application layer so use cases depend on an
 * interface rather than on TypeORM or any infrastructure library.
 */

export interface EmissionRecord {
  id: string;
  saleId: string;
  emissionNumber: number;
  issuedAt: Date;
  templateVersion: string;
  snapshotJson: Record<string, unknown>;
}

export interface SaleConstanciaEmissionRepository {
  /**
   * Persist a new emission record.
   */
  save(emission: EmissionRecord): Promise<void>;

  /**
   * List all emissions for a sale, ordered by emission number descending
   * (most recent first).
   */
  findBySaleId(saleId: string): Promise<EmissionRecord[]>;

  /**
   * Find a single emission by its ID.
   * Returns null when not found.
   */
  findById(id: string): Promise<EmissionRecord | null>;

  /**
   * Count existing emissions for a sale.
   * Used to determine the next emission number.
   */
  countBySaleId(saleId: string): Promise<number>;
}
