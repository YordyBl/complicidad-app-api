-- Migration: inventario-complicidad-v2 — pricing refactor
-- Description:
--   - Products: rename base_price_cents → sale_price_cents, add presale_price_cents
--   - Variants: drop price_cents column
--   - SaleLines: add price_type column
--   - SKU uniqueness remains unchanged; normalization is now lowercase in app layer

-- =============================================================
-- 1. Products table
-- =============================================================
ALTER TABLE products RENAME COLUMN base_price_cents TO sale_price_cents;
ALTER TABLE products ADD COLUMN presale_price_cents INTEGER;

-- =============================================================
-- 2. Variants table — drop variant-level pricing
-- =============================================================
ALTER TABLE variants DROP COLUMN IF EXISTS price_cents;

-- =============================================================
-- 3. Sale lines — add price type tracking
-- =============================================================
ALTER TABLE sale_lines ADD COLUMN price_type VARCHAR(10) NOT NULL DEFAULT 'regular';
