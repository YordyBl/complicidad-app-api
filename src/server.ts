import { API_PREFIX, createApp } from './app.js';
import { env } from './config/env.js';
import { createDataSource } from './infrastructure/typeorm/datasource.js';
import { TypeOrmUnitOfWork } from './infrastructure/typeorm/unit-of-work.js';
import { createAuthModule } from './modules/auth-users/composition.js';
import { createInventoryModule } from './modules/inventory/composition.js';
import { createSalesModule } from './modules/sales-returns/composition.js';
import { createCustomerModule } from './modules/customers/composition.js';
import { createAccountingModule } from './modules/accounting-reports/composition.js';
import type { DataSource } from 'typeorm';

// ── Retry with exponential backoff ────────────────────────────────────
// Docker DNS can produce transient EAI_AGAIN failures when the API
// container starts before the internal DNS resolver is ready.
// Retry with backoff tolerates these while failing fast on permanent
// errors (bad credentials, missing tables, etc.).

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2_000; // 2s → 4s → 8s → 16s → 32s max total ~62s

async function waitForDataSource(): Promise<DataSource> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ds = await createDataSource();
      console.log('[complicidad] Database connected');
      return ds;
    } catch (err: unknown) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[complicidad] Database unavailable (attempt ${String(attempt)}/${String(MAX_RETRIES)}), retrying in ${String(delay / 1_000)}s: ${message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const finalMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `[complicidad] Database unavailable after ${String(MAX_RETRIES)} attempts: ${finalMessage}`,
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────
// Sequential startup ensures routes are mounted BEFORE the server starts
// listening. If the database is unavailable after all retries the process
// exits with code 1 so Docker's restart policy triggers a new container.

const app = createApp();

// Only start listening and initialize DB when this is the main module
// (prevents port conflicts and DB connections in tests that import the app)
if (process.env.NODE_ENV !== 'test') {
  waitForDataSource()
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

      // Only listen AFTER all routes are mounted — no gap between
      // /health-ready and endpoint-unavailable
      app.listen(env.port, () => {
        console.log(
          `[complicidad] Server listening on http://localhost:${String(env.port)}`,
        );
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[complicidad] Fatal startup error:', message);
      process.exit(1);
    });
}

export { app };
