# TypeORM Migrations

This directory contains the database migration files for the Complicidad backend.

## Running Migrations

```bash
# Generate a migration from entity changes (if synchronize is off)
npx typeorm migration:generate src/infrastructure/typeorm/migrations/<Name> -d src/infrastructure/typeorm/datasource.ts

# Run pending migrations
npx typeorm migration:run -d src/infrastructure/typeorm/datasource.ts

# Revert last migration
npx typeorm migration:revert -d src/infrastructure/typeorm/datasource.ts
```

## Required Database Constraints

Below are the DB-level constraints that SHOULD exist on the PostgreSQL database.
These are documented because `synchronize: false` is the intended production mode.
Generate their corresponding migration files when a database connection is available.

### 1. Cash Ledger Entries (`cash_ledger_entries`)

```sql
-- Ensures no negative sale income entries (positive amount = income)
ALTER TABLE cash_ledger_entries
  ADD CONSTRAINT chk_sale_income_positive
  CHECK (type != 'SALE_INCOME' OR amount_cents > 0);

-- Ensures no positive purchase outflow entries (negative amount = outflow)
ALTER TABLE cash_ledger_entries
  ADD CONSTRAINT chk_purchase_outflow_negative
  CHECK (type != 'PURCHASE_OUTFLOW' OR amount_cents < 0);

-- Ensures return outflow is positive (customer gets money back)
ALTER TABLE cash_ledger_entries
  ADD CONSTRAINT chk_return_outflow_positive
  CHECK (type != 'RETURN_OUTFLOW' OR amount_cents > 0);

-- Valid entry types
ALTER TABLE cash_ledger_entries
  ADD CONSTRAINT chk_entry_type
  CHECK (type IN ('SALE_INCOME', 'PURCHASE_OUTFLOW', 'RETURN_OUTFLOW', 'MANUAL_ADJUSTMENT', 'MANUAL_WITHDRAWAL'));

-- Valid tags for purchase outflows
ALTER TABLE cash_ledger_entries
  ADD CONSTRAINT chk_reinvestment_tag
  CHECK (type != 'PURCHASE_OUTFLOW' OR tag IN ('REINVESTMENT', 'RESTOCK') OR tag IS NULL);
```

### 2. Inventory Lots (`inventory_lots`)

```sql
-- Remaining quantity must not exceed purchased quantity
ALTER TABLE inventory_lots
  ADD CONSTRAINT chk_lot_remaining_qty
  CHECK (remaining_quantity >= 0 AND remaining_quantity <= purchased_quantity);

-- Unit cost must be non-negative
ALTER TABLE inventory_lots
  ADD CONSTRAINT chk_lot_unit_cost
  CHECK (unit_cost_cents >= 0);
```

### 3. Sales (`sales`)

```sql
-- Valid sale statuses
ALTER TABLE sales
  ADD CONSTRAINT chk_sale_status
  CHECK (status IN ('ACTIVE', 'CANCELLED', 'RETURNED'));
```

### 4. Sale Lines (`sale_lines`)

```sql
-- Positive quantities and prices
ALTER TABLE sale_lines
  ADD CONSTRAINT chk_sale_line_quantity
  CHECK (quantity > 0);

ALTER TABLE sale_lines
  ADD CONSTRAINT chk_sale_line_price
  CHECK (unit_price_cents >= 0);
```

### 5. Lot Consumption Records (`lot_consumption_records`)

```sql
-- Positive consumption quantities (never zero or negative)
ALTER TABLE lot_consumption_records
  ADD CONSTRAINT chk_consumption_quantity
  CHECK (quantity > 0);

-- Non-negative cost and subtotal
ALTER TABLE lot_consumption_records
  ADD CONSTRAINT chk_consumption_cost
  CHECK (unit_cost_cents >= 0 AND subtotal_cents >= 0);
```

### 6. Users (`users`)

```sql
-- Unique email
ALTER TABLE users
  ADD CONSTRAINT uq_users_email UNIQUE (email);
```

### 7. Products and Variants

```sql
-- Unique SKU across variants
ALTER TABLE variants
  ADD CONSTRAINT uq_variants_sku UNIQUE (sku);

-- Unique alias across products
ALTER TABLE products
  ADD CONSTRAINT uq_products_aliases UNIQUE (aliases);
```

## Indexes for Performance

```sql
-- FIFO consumption: find open lots ordered by date for a variant
CREATE INDEX idx_inventory_lots_variant_date
  ON inventory_lots (variant_id, purchase_date ASC)
  WHERE remaining_quantity > 0;

-- Sales lookup by customer
CREATE INDEX idx_sales_customer
  ON sales (customer_id);

-- Cash ledger chronological queries
CREATE INDEX idx_cash_ledger_entries_created
  ON cash_ledger_entries (created_at ASC);

-- Lot consumption by purchase lot (for cancellation/return)
CREATE INDEX idx_lot_consumption_records_purchase_lot
  ON lot_consumption_records (purchase_lot_id);
```

## Adding New Migrations

1. Make changes to entity files in `src/modules/*/infrastructure/typeorm/`
2. Run `npx typeorm migration:generate` with a descriptive name
3. Review the generated SQL
4. Run `npx typeorm migration:run` to apply
5. Commit the migration file
