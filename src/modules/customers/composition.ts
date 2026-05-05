/**
 * Customer module composition root.
 *
 * Wires the domain, application, infrastructure, and HTTP layers together.
 * Called from the server bootstrap (server.ts) once the DataSource is available.
 *
 * NOTE: The customer history use case requires a UnitOfWork (which needs a
 * DataSource), while CRUD use cases only need the CustomerRepository. The
 * composition accepts an optional EntityManager for the repo and a separate
 * UnitOfWork for the history query.
 */
import { Router } from 'express';
import type { EntityManager } from 'typeorm';
import type { UnitOfWork } from '../../shared/application/UnitOfWork.js';
import { CustomerTypeOrmRepository } from './infrastructure/typeorm/CustomerTypeOrmRepository.js';
import { CreateCustomerUseCase } from './application/use-cases/CreateCustomerUseCase.js';
import { UpdateCustomerUseCase } from './application/use-cases/UpdateCustomerUseCase.js';
import { GetCustomerUseCase } from './application/use-cases/GetCustomerUseCase.js';
import { ListCustomersUseCase } from './application/use-cases/ListCustomersUseCase.js';
import { GetCustomerHistoryUseCase } from './application/use-cases/GetCustomerHistoryUseCase.js';
import { CustomerController } from './interfaces/http/CustomerController.js';
import { createCustomerRouter } from './interfaces/http/customer-routes.js';

/**
 * Create and wire the customer module, returning an Express Router.
 *
 * @param manager - TypeORM EntityManager (from DataSource) or `undefined`.
 * @param uow - UnitOfWork instance for transactional queries (history).
 */
export function createCustomerModule(manager?: EntityManager, uow?: UnitOfWork): Router {
  if (!manager || !uow) {
    const router = Router();
    router.all('*', (_req, res) => {
      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'Base de datos no conectada — endpoints de clientes no disponibles',
      });
    });
    return router;
  }

  const customerRepo = new CustomerTypeOrmRepository(manager);
  const createUseCase = new CreateCustomerUseCase(customerRepo);
  const updateUseCase = new UpdateCustomerUseCase(customerRepo);
  const getUseCase = new GetCustomerUseCase(customerRepo);
  const listUseCase = new ListCustomersUseCase(customerRepo);
  const historyUseCase = new GetCustomerHistoryUseCase(customerRepo);

  const controller = new CustomerController(
    createUseCase,
    updateUseCase,
    getUseCase,
    listUseCase,
    historyUseCase,
    uow,
  );

  return createCustomerRouter(controller);
}
