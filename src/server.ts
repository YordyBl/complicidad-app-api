import { API_PREFIX, createApp } from './app.js';
import { env } from './config/env.js';
import { createDataSource } from './infrastructure/typeorm/datasource.js';
import { TypeOrmUnitOfWork } from './infrastructure/typeorm/unit-of-work.js';
import { createAuthModule } from './modules/auth-users/composition.js';
import { createInventoryModule } from './modules/inventory/composition.js';
import { createSalesModule } from './modules/sales-returns/composition.js';
import { createCustomerModule } from './modules/customers/composition.js';
import { createAccountingModule } from './modules/accounting-reports/composition.js';

const app = createApp();

// Only start listening and initialize DB when this is the main module
// (prevents port conflicts and DB connections in tests that import the app)
if (process.env.NODE_ENV !== 'test') {
  // Try to initialize database and mount all module routes
  createDataSource()
    .then((ds) => {
      const uow = new TypeOrmUnitOfWork(ds);

      const authRouter = createAuthModule(ds.manager);
      app.use(API_PREFIX, authRouter);
      console.log('[complicidad] Auth routes mounted');

      const inventoryRouter = createInventoryModule(ds.manager, uow);
      app.use(API_PREFIX, inventoryRouter);
      console.log('[complicidad] Inventory routes mounted');

      const salesRouter = createSalesModule(ds.manager, uow);
      app.use(API_PREFIX, salesRouter);
      console.log('[complicidad] Sales/returns routes mounted');

      const customerRouter = createCustomerModule(ds.manager, uow);
      app.use(API_PREFIX, customerRouter);
      console.log('[complicidad] Customer routes mounted');

      const accountingRouter = createAccountingModule(ds.manager);
      app.use(API_PREFIX, accountingRouter);
      console.log('[complicidad] Accounting/report routes mounted');
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[complicidad] Database unavailable — some endpoints disabled:', message);
    });

  app.listen(env.port, () => {
    console.log(`[complicidad] Server listening on http://localhost:${String(env.port)}`);
  });
}

export { app };
