/**
 * TypeORM-backed implementation of SaleConstanciaEmissionRepository.
 *
 * Operates directly on the sale_constancia_emissions table via
 * EntityManager queries.
 */
import type { EntityManager } from 'typeorm';
import type {
  SaleConstanciaEmissionRepository,
  EmissionRecord,
} from '../../application/ports/SaleConstanciaEmissionRepository.js';
import { SaleConstanciaEmissionEntity } from './SaleConstanciaEmissionEntity.js';

export class TypeOrmSaleConstanciaEmissionRepository
  implements SaleConstanciaEmissionRepository
{
  constructor(private readonly manager: EntityManager) {}

  async save(emission: EmissionRecord): Promise<void> {
    const entity = new SaleConstanciaEmissionEntity();
    entity.id = emission.id;
    entity.saleId = emission.saleId;
    entity.emissionNumber = emission.emissionNumber;
    entity.issuedAt = emission.issuedAt;
    entity.templateVersion = emission.templateVersion;
    entity.snapshotJson = emission.snapshotJson;
    // createdAt/updatedAt are auto-set by TypeORM BaseEntity

    await this.manager.save(entity);
  }

  async findBySaleId(saleId: string): Promise<EmissionRecord[]> {
    const rows = await this.manager.find(SaleConstanciaEmissionEntity, {
      where: { saleId },
      order: { emissionNumber: 'DESC' },
    });

    return rows.map((r) => this.toRecord(r));
  }

  async findById(id: string): Promise<EmissionRecord | null> {
    const row = await this.manager.findOne(SaleConstanciaEmissionEntity, {
      where: { id },
    });

    return row ? this.toRecord(row) : null;
  }

  async countBySaleId(saleId: string): Promise<number> {
    return this.manager.count(SaleConstanciaEmissionEntity, {
      where: { saleId },
    });
  }

  private toRecord(entity: SaleConstanciaEmissionEntity): EmissionRecord {
    return {
      id: entity.id,
      saleId: entity.saleId,
      emissionNumber: entity.emissionNumber,
      issuedAt: entity.issuedAt,
      templateVersion: entity.templateVersion,
      snapshotJson: entity.snapshotJson,
    };
  }
}
