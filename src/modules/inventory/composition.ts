/**
 * Inventory module composition root.
 *
 * Wires the domain, application, infrastructure, and HTTP layers together.
 * Called from the server bootstrap once the DataSource is available.
 */
import { Router } from 'express';
import type { EntityManager } from 'typeorm';
import type { UnitOfWork } from '../../shared/application/UnitOfWork.js';
import { ProductTypeOrmRepository } from './infrastructure/typeorm/ProductTypeOrmRepository.js';
import { VariantTypeOrmRepository } from './infrastructure/typeorm/VariantTypeOrmRepository.js';
import { InventoryLotTypeOrmRepository } from './infrastructure/typeorm/InventoryLotTypeOrmRepository.js';
import { CreateProductUseCase } from './application/use-cases/CreateProductUseCase.js';
import { SearchItemUseCase } from './application/use-cases/SearchItemUseCase.js';
import { RegisterPurchaseUseCase } from './application/use-cases/RegisterPurchaseUseCase.js';
import { ListProductsUseCase } from './application/use-cases/ListProductsUseCase.js';
import { ProductController } from './interfaces/http/ProductController.js';
import { InventoryController } from './interfaces/http/InventoryController.js';
import { createInventoryRouter } from './interfaces/http/inventory-routes.js';

/**
 * Create and wire the inventory module, returning an Express Router.
 *
 * @param manager - TypeORM EntityManager (from DataSource) or `undefined`.
 * @param uow     - UnitOfWork instance for transactional operations (purchases).
 */
export function createInventoryModule(manager?: EntityManager, uow?: UnitOfWork): Router {
  if (!manager || !uow) {
    const router = Router();
    router.all('*', (_req, res) => {
      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'Base de datos no conectada — endpoints de inventario no disponibles',
      });
    });
    return router;
  }

  // Infrastructure
  const productRepo = new ProductTypeOrmRepository(manager);
  const variantRepo = new VariantTypeOrmRepository(manager);
  const lotRepo = new InventoryLotTypeOrmRepository(manager);

  // Application use cases
  const createProductUseCase = new CreateProductUseCase(productRepo, variantRepo);
  const searchItemUseCase = new SearchItemUseCase(variantRepo, productRepo, lotRepo);
  const registerPurchaseUseCase = new RegisterPurchaseUseCase(variantRepo);
  const listProductsUseCase = new ListProductsUseCase(productRepo);

  // HTTP controllers
  const productController = new ProductController(createProductUseCase, searchItemUseCase, listProductsUseCase);
  const inventoryController = new InventoryController(registerPurchaseUseCase, uow);

  return createInventoryRouter(productController, inventoryController);
}
