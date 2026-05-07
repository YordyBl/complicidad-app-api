/**
 * Mapper between the domain `Sale` aggregate and TypeORM entities.
 *
 * Converts the full aggregate (sale + lines + lot consumptions)
 * bidirectionally.
 */
import type { BaseMapper } from '../../../../infrastructure/typeorm/mappers/BaseMapper.js';
import { Sale, SALE_CHANNELS } from '../../domain/Sale.js';
import type { SaleChannel } from '../../domain/Sale.js';
import { SaleId } from '../../domain/SaleId.js';
import { SaleLine, type PriceType } from '../../domain/SaleLine.js';
import { SaleLineId } from '../../domain/SaleLineId.js';
import { LotConsumptionRecord } from '../../domain/LotConsumptionRecord.js';
import { Money } from '../../../../shared/domain/Money.js';
import { SaleEntity } from './SaleEntity.js';
import { SaleLineEntity } from './SaleLineEntity.js';
import { LotConsumptionRecordEntity } from './LotConsumptionRecordEntity.js';

export class SaleMapper implements BaseMapper<Sale, SaleEntity> {
  toDomain(entity: SaleEntity): Sale {
    const lines = entity.lines.map((lineEntity) => {
      const consumptions = lineEntity.consumptions.map(
        (c) =>
          new LotConsumptionRecord(
            c.id,
            c.purchaseLotId,
            c.quantity,
            Money.fromCents(c.unitCostCents),
            Money.fromCents(c.subtotalCents),
          ),
      );

      return new SaleLine(
        SaleLineId.from(lineEntity.id),
        lineEntity.variantId,
        lineEntity.quantity,
        Money.fromCents(lineEntity.unitPriceCents),
        lineEntity.priceType as PriceType,
        consumptions,
      );
    });

    const channel = SALE_CHANNELS.includes(entity.channel as SaleChannel)
      ? (entity.channel as SaleChannel)
      : 'web';

    return new Sale(
      SaleId.from(entity.id),
      entity.customerId,
      entity.channelReference ?? undefined,
      channel,
      lines,
      entity.status as 'ACTIVE' | 'CANCELLED' | 'RETURNED',
      entity.createdAt,
      entity.updatedAt,
    );
  }

  toPersistence(domain: Sale): SaleEntity {
    const entity = new SaleEntity();
    entity.id = domain.id.toString();
    entity.customerId = domain.customerId;
    entity.channelReference = domain.channelReference ?? null;
    entity.channel = domain.channel;
    entity.status = domain.status;

    entity.lines = domain.lines.map((line) => {
      const lineEntity = new SaleLineEntity();
      lineEntity.id = line.id.toString();
      lineEntity.variantId = line.variantId;
      lineEntity.quantity = line.quantity;
      lineEntity.unitPriceCents = line.unitPrice.cents;
      lineEntity.priceType = line.priceType;

      lineEntity.consumptions = line.consumptions.map((c) => {
        const recordEntity = new LotConsumptionRecordEntity();
        recordEntity.id = c.id;
        recordEntity.purchaseLotId = c.purchaseLotId;
        recordEntity.quantity = c.quantity;
        recordEntity.unitCostCents = c.unitCost.cents;
        recordEntity.subtotalCents = c.subtotal.cents;
        return recordEntity;
      });

      return lineEntity;
    });

    return entity;
  }
}
