# Complicidad Backend

Internal REST API for auditable employees, inventory, sales, customers, cash, and reports.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ (ESM) |
| Language | TypeScript 5.6+ (strict) |
| Framework | Express 4 |
| ORM | TypeORM 0.3 (infrastructure only — domain is pure) |
| Database | PostgreSQL 16 |
| Auth | JWT (5-day expiry, bcryptjs password hashing) |
| Testing | Vitest + Supertest |
| Lint | ESLint 9 with typescript-eslint |

## Quick Start

```bash
# 1. Install
npm install

# 2. Environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials and JWT_SECRET

# 3. Run migrations (requires PostgreSQL)
npx typeorm migration:run -d src/infrastructure/typeorm/datasource.ts

# 4. Start dev server
npm run dev
```

Server starts at `http://localhost:3000` (configurable via `PORT`).

---

## Docker

Run the full stack (PostgreSQL + API) with a single command:

```bash
# 1. Copy environment file
cp .env.example .env
# Optionally edit .env to change secrets / ports

# 2. Start both services
docker compose up -d

# 3. Check logs
docker compose logs -f api

# 4. Verify health
curl http://localhost:3000/health

# 5. Stop everything
docker compose down

#    To also delete the database volume:
docker compose down -v
```

### Services

| Service   | Image                  | Port    | Healthcheck                                  |
|-----------|------------------------|---------|----------------------------------------------|
| `api`     | _builds from Dockerfile_ | `3000`  | `GET /health` (unauthenticated), API under `/api/v1` |
| `postgres` | `postgres:16-alpine`  | `5432`  | `pg_isready -U complicidad`                  |

### Environment Variables in Docker

The docker-compose.yml reads from your `.env` file automatically. Key variables:

| Variable       | Compose default                 | Notes                                     |
|----------------|---------------------------------|-------------------------------------------|
| `DB_PASSWORD`  | `sWhBh0V0FdkYxCP5`              | Must match between `postgres` and `api`   |
| `JWT_SECRET`   | `change-me-in-production`       | **Override for production**               |
| `DB_SYNC`      | `"true"`                        | Dev only: TypeORM creates/updates tables  |
| `API_PORT`     | `3000`                          | Host port for the API                     |
| `DB_PORT`      | `5432`                          | Host port for PostgreSQL                  |

Inside the Docker network, `DB_HOST` is fixed to the service name `postgres` (set in compose, not overridable from `.env`).

### Database Sync vs Migrations

In Docker development, `DB_SYNC=true`, so TypeORM auto-creates/updates tables from entity metadata when the API starts.

For production, set `DB_SYNC=false` and use migrations instead:

```bash
docker compose exec api npm run typeorm -- migration:run -d src/infrastructure/typeorm/datasource.ts
```

> **Warning**: `DB_SYNC=true` is for development only. Never use it in production.

### Docker Development Reload

The API container runs `npm run dev` and mounts `./src` into `/app/src`, so saving TypeScript files restarts the server automatically through `tsx watch`. You only need to rebuild the image after dependency or Dockerfile changes.

### Useful Commands

```bash
# Rebuild the API image (after dependency changes)
docker compose build --no-cache api

# Run tests inside the container
docker compose exec api npm test

# Run typecheck inside the container
docker compose exec api npm run typecheck

# Open a shell inside the API container
docker compose exec api sh

# Access PostgreSQL CLI
docker compose exec postgres psql -U complicidad -d complicidad

# View database logs
docker compose logs -f postgres

# Restart the API service only
docker compose restart api

# Check API health through Docker
docker compose ps
```

### `.dockerignore`

The `.dockerignore` excludes `node_modules/`, `dist/`, `.env`, `.git/`, and other non-essential files from the build context — keeping image builds lean.

### Image Structure

The `Dockerfile` uses a **multi-stage build**:

| Stage   | Base            | Purpose                                           |
|---------|-----------------|---------------------------------------------------|
| `deps`  | `node:22-alpine` | Install all npm dependencies (including devDeps)  |
| `runtime` | `node:22-alpine` | Copy node_modules + src + config, set non-root user |

The app runs TypeScript directly via `tsx` — there is no `tsc` compilation step. Source `.ts` files are included in the image because TypeORM entity/migration paths use glob patterns that reference them.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `JWT_SECRET` | **Yes** | — | Secret key for signing JWTs (min 32 chars recommended) |
| `DB_HOST` | No | `localhost` | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | No | `complicidad` | Database name |
| `DB_USER` | No | `complicidad` | Database user |
| `DB_PASSWORD` | No | `""` | Database password |
| `DB_SYNC` | No | `false` | Auto-sync TypeORM schema (dev only — never in production) |

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot-reload (tsx watch) |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests only |
| `npm run test:e2e` | E2E tests (fakes-based, no DB needed) |
| `npm run test:application` | Application-layer tests |
| `npm run test:architecture` | Architecture constraint tests |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |

## Architecture

```
src/
├── app.ts                          # Express app factory (middleware + routes)
├── server.ts                       # Server entry (DataSource init + module mounting)
├── config/
│   ├── env.ts                      # Typed environment configuration
│   └── database.ts                 # TypeORM DataSource config factory
├── shared/
│   ├── domain/                     # Pure domain primitives (Money, EntityId, Result, errors, Clock)
│   └── application/                # Port interfaces (UnitOfWork, transactions)
├── infrastructure/
│   ├── http/                       # Express middleware (error handler, request logger)
│   └── typeorm/                    # TypeORM DataSource, base entity, UoW, migrations
└── modules/                        # Module-first bounded contexts
    ├── auth-users/                 # User auth, JWT issues
    ├── inventory/                  # Products, variants, suppliers, purchases, FIFO lots
    ├── sales-returns/              # Sales, cancellations, returns
    ├── customers/                  # Customer CRUD, derived purchase history
    └── accounting-reports/         # Cash ledger, closings, financial reports
```

### Hexagonal Structure (per module)

Each module follows the same internal structure:

```
src/modules/<name>/
├── domain/              # Pure TS entities, value objects, repository interfaces
├── application/         # Use cases (orchestrate domain + infrastructure ports)
├── infrastructure/      # TypeORM entities, mappers, repositories (implements ports)
└── interfaces/http/     # Express controllers, DTOs, route registration
```

Key rule: **domain never imports from infrastructure**. The dependency inversion principle is enforced by:
- An architecture test (`tests/architecture/no-typeorm-in-domain.test.ts`)
- An ESLint rule that prevents `TypeORM` imports from `src/modules/*/domain/`

## API Endpoints

All endpoints return JSON. Error responses follow `{ error: string, message: string }`.

All application endpoints are mounted under `/api/v1`.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/login` | Authenticate with email + password, receive 5-day JWT |

### Products & Inventory

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/products` | Create a new product with its first variant |
| `GET` | `/api/v1/products` | List products with search & pagination (`?search=`, `?status=`, `?page=`, `?pageSize=`) |
| `GET` | `/api/v1/products/:id` | Get product detail by canonical ID (200 / 404) |
| `GET` | `/api/v1/items/search?term=...` | Search items by SKU or alias |
| `POST` | `/api/v1/purchases` | Register a stock purchase (creates FIFO lots + cash outflow) |

### Sales & Returns

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/sales` | List sales with optional filters (`?customerId=`, `?status=`, `?dateFrom=`, `?dateTo=`, `?sortOrder=`) |
| `GET` | `/api/v1/sales/:id` | Get sale detail by ID (200 / 400 / 404) |
| `POST` | `/api/v1/sales` | Create a multi-item sale (FIFO consumption + cash income). `channel` is required; `channelReference` is optional/deprecated. |
| `POST` | `/api/v1/sales/:id/cancel` | Cancel an active sale (restores lots + reverses cash) |
| `POST` | `/api/v1/sales/:id/return` | Full return of an active sale (restores lots + return outflow) |

### Customers

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/customers` | List all customers |
| `POST` | `/api/v1/customers` | Create a customer |
| `GET` | `/api/v1/customers/:id` | Get customer by ID |
| `PUT` | `/api/v1/customers/:id` | Update customer |
| `GET` | `/api/v1/customers/:id/history` | Customer purchase history (derived from sales) |

### Reports

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/reports/liquidity` | Current cash balance (excludes stock value) |
| `GET` | `/api/v1/reports/stock-investment` | Inventory valued at FIFO cost |
| `GET` | `/api/v1/reports/sales-total` | Total income from ACTIVE (non-cancelled, non-returned) sales |
| `GET` | `/api/v1/reports/fifo-cogs` | Cost of goods sold from active sales |
| `GET` | `/api/v1/reports/gross-profit` | Sales income − FIFO COGS |
| `GET` | `/api/v1/reports/reinvestment` | Purchase/restock cash outflows |
| `GET` | `/api/v1/reports/operating-capital` | Liquidity + stock investment |
| `GET` | `/api/v1/reports/stock-by-product` | Stock grouped by product/variant |
| `GET` | `/api/v1/reports/lots` | Open vs exhausted FIFO lots |
| `POST` | `/api/v1/cash/closings` | Manual cash close (snapshot current liquidity) |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (unauthenticated) |

## Financial Semantics

The v1 accounting model is **simple cash accounting + FIFO-valued inventory** — not formal double-entry accounting.

| Metric | Definition |
|---|---|
| **Liquidity** | Cash balance from all cash ledger entries (income − outflows). Does NOT include stock value. |
| **Sales Income** | Sum of all ACTIVE (non-cancelled, non-returned) sale revenues. Returned amounts reduce this via RETURN_OUTFLOW entries. |
| **Purchases / Restocks** | Cash spent on stock intake, recorded as PURCHASE_OUTFLOW entries (negative amounts). |
| **Stock Investment** | Remaining FIFO lot quantity × unit cost. Represents capital tied up in inventory. |
| **FIFO COGS** | Cost of goods sold = sum of consumed lot costs from ACTIVE sales only. |
| **Gross / Estimated Profit** | Sales income − FIFO COGS. Called "estimated" because operational expenses are not modelled. |
| **Reinvestment** | Purchase/restock cash outflows tagged as `REINVESTMENT` or `RESTOCK`. Always a positive value. |
| **Estimated Operating Capital** | Liquidity + stock investment. Rough measure of total operating resources. |

### Key Behaviours

- **Sales immediately impact cash**: v1 has no payment methods or receivables. A sale creates a positive cash entry immediately.
- **Returns reduce cash and income**: returns create RETURN_OUTFLOW entries (positive amount). Sales income reports exclude returned sales (status = RETURNED).
- **Cancellations reverse everything**: cancelling a sale restores exact FIFO lots and creates a negative SALE_INCOME entry.
- **FIFO consumption is frozen**: when a sale occurs, the exact lot unit costs are recorded in LotConsumptionRecords. Neither returns nor cancellations recalculate FIFO — they use the stored consumptions.

## Database Requirements

The API requires a running PostgreSQL 16 instance. Without a database connection:

- **Unit tests and application tests** run fine (they use fake repositories).
- **E2E tests** run fine (fakes-based, no DB needed).
- **Integration tests** require a real PostgreSQL (skipped when unavailable).
- **Server startup** logs a warning and skips module mounting when the DB is unavailable.

### Database Constraints

Check `src/infrastructure/typeorm/migrations/README.md` for the full list of
CHECK constraints, unique constraints, and indexes that should exist on the
production database.

**Important**: `DB_SYNC=true` is convenient for development but **never use it in production**.
Always use proper migrations.

## Testing Strategy

| Layer | What | DB Required? |
|---|---|---|
| **Unit tests** | Money math, FIFO allocation, return restoration, cash calculations | No |
| **Application tests** | Use case orchestration with fakes (sales, purchases, returns, reports) | No |
| **Integration tests** | TypeORM mappings, rollbacks, report SQL | Yes (PostgreSQL) |
| **E2E tests** | Full HTTP flow with fakes (auth, purchase, sale, return, reports) | No |

### Running Tests

```bash
# All tests (fast — no DB needed)
npm test

# Layer-specific
npm run test:unit        # Pure domain logic
npm run test:application # Use case orchestration
npm run test:integration # TypeORM (requires DB)
npm run test:e2e         # HTTP flow (fakes, no DB)
npm run test:architecture # Import rules

# Type check (no build)
npm run typecheck
```

### Database Integration Tests

Integration tests for TypeORM mappings, row-locking, and report SQL are
defined but **skipped** by default (they require a real PostgreSQL instance).
To run them:

1. Start a PostgreSQL instance and configure `.env`
2. Run: `DB_SYNC=true npx vitest run tests/integration`

## Concurrency

FIFO lot consumption is protected against overselling through PostgreSQL
row-level locks (`SELECT ... FOR UPDATE`) ordered by lot receipt date.
This ensures that concurrent requests for the same final stock unit
result in exactly one successful sale and one rejection.

The domain-level `InsufficientStockError` is thrown when available stock
is insufficient for the requested quantity.

**Known limitation**: true `Promise.all` concurrency tests require a
real PostgreSQL test database with the TypeORM row-locking implementation.
Application-level tests with fakes verify the business logic outcome
(one succeeds, one fails) but cannot validate the actual DB locking
behaviour.

## Deferred / Future Work

### Auth / RBAC (Critical)

- **No backend auth/RBAC middleware** — All routes are technically open.
  JWT validation exists but is not enforced at the route level.
  **This is documented technical debt — do NOT treat frontend auth as
  guaranteed backend protection.** Any production deployment must address
  this before exposing the system to untrusted networks.
  The APP contract (`shared/api/contracts.md`) carries the same warning.

### Other Deferred Items

- **Partial returns**: currently only full-sale returns are supported.
  A `PartialReturnUseCase` would follow the same pattern but select
  specific lines/consumptions.
- **Supplier CRUD HTTP endpoints**: suppliers exist in the domain but
  have no HTTP interface yet (they are referenced indirectly via purchases).
- **User management HTTP endpoints**: `/users` CRUD routes are defined
  in the design but not yet implemented.
- **Audit logging**: no explicit audit trail for mutations.
- **Integration tests with real DB**: defined but skipped without PostgreSQL.

## License

Private — internal use.
