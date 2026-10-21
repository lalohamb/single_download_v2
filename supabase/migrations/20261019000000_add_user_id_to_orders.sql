-- Migration: 20261019000000_add_user_id_to_orders.sql
-- GAP-004: add nullable user_id FK to orders table
-- Safe to run on existing installs — ADD COLUMN IF NOT EXISTS is idempotent.
-- Existing orders remain with user_id = NULL (guest orders).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
