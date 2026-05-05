/**
 * Sales / Returns module composition root.
 *
 * Wires the domain, application, infrastructure, and HTTP layers together.
 * Called from the server bootstrap once the DataSource is available.
 *
 * NOTE: This module requires:
 * - CustomerRepository (from customers module — cross-module dependency)
 * - VariantRepository (from inventory module — cross-module dependency)
 * - UnitOfWork with scope providing SaleRepository, InventoryLotRepository,
 *   CashLedgerRepository
 */
import { Router } from 'express';
import type { EntityManager } from 'typeorm';
import type { UnitOfWork } from '../../shared/application/UnitOfWork.js';
import { CustomerTypeOrmRepository } from '../customers/infrastructure/typeorm/CustomerTypeOrmRepository.js';
import { VariantTypeOrmRepository } from '../inventory/infrastructure/typeorm/VariantTypeOrmRepository.js';
import { ProductTypeOrmRepository } from '../inventory/infrastructure/typeorm/ProductTypeOrmRepository.js';
import { SaleTypeOrmRepository } from './infrastructure/typeorm/SaleTypeOrmRepository.js';
import { CreateSaleUseCase } from './application/use-cases/CreateSaleUseCase.js';
import { CancelSaleUseCase } from './application/use-cases/CancelSaleUseCase.js';
import { ReturnFullSaleUseCase } from './application/use-cases/ReturnFullSaleUseCase.js';
import { ListSalesUseCase } from './application/use-cases/ListSalesUseCase.js';
import { GetSaleDetailUseCase } from './application/use-cases/GetSaleDetailUseCase.js';
import { SaleController } from './interfaces/http/SaleController.js';
import { createSaleRouter } from './interfaces/http/sale-routes.js';

/**
 * Create and wire the sales/returns module, returning an Express Router.
 *
 * @param manager - TypeORM EntityManager (from DataSource) or `undefined`.
 * @param uow     - UnitOfWork instance for transactional operations.
 */
export function createSalesModule(manager?: EntityManager, uow?: UnitOfWork): Router {
  if (!manager || !uow) {
    const router = Router();
    router.all('*', (_req, res) => {
      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'Base de datos no conectada — endpoints de ventas no disponibles',
      });
    });
    return router;
  }

  // Infrastructure
  const customerRepo = new CustomerTypeOrmRepository(manager);
  const variantRepo = new VariantTypeOrmRepository(manager);
  const productRepo = new ProductTypeOrmRepository(manager);
  const saleRepo = new SaleTypeOrmRepository(manager);

  // Application use cases
  const createSaleUseCase = new CreateSaleUseCase(customerRepo, variantRepo, productRepo);
  const cancelSaleUseCase = new CancelSaleUseCase();
  const returnFullSaleUseCase = new ReturnFullSaleUseCase();
  const listSalesUseCase = new ListSalesUseCase(saleRepo);
  const getSaleDetailUseCase = new GetSaleDetailUseCase(saleRepo);

  // HTTP controller
  const controller = new SaleController(
    createSaleUseCase,
    cancelSaleUseCase,
    returnFullSaleUseCase,
    uow,
    listSalesUseCase,
    getSaleDetailUseCase,
  );

  return createSaleRouter(controller);
}
