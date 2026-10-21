-- GAP-019: Fix affiliate_payouts schema for existing installations.
--
-- fresh_install.sql previously defined affiliate_payouts with wrong column names:
--   amount, method, memo, stripe_transfer_id
--
-- The application code (src/app/api/affiliates/route.ts) inserts:
--   total_amount, payout_method, payout_handle, stripe_memo, status, paid_at, period
--
-- This migration brings existing installations into alignment with the correct
-- schema defined in 20261001000000_add_affiliates.sql and used by the application.
--
-- Safety: all ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS operations are
-- idempotent. Running this migration on a DB that already has the correct schema
-- (from 20261001000000_add_affiliates.sql) is safe -- the IF EXISTS guards prevent
-- errors and no data is lost.
--
-- Rollback: see docs/governance/reports/PHASE-M1B-REPORT.md for rollback instructions.

-- Add correct columns (no-op if already present from the correct migration)
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS period        text;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS total_amount  numeric;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS payout_method text;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS payout_handle text;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS stripe_memo   text;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'pending';
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS paid_at       timestamptz;

-- Migrate any existing data from old columns to new columns before dropping.
-- Only runs if the old 'amount' column actually exists (production installs with
-- the wrong schema). On a clean migration-chain install the old columns never
-- existed so this block is skipped entirely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'affiliate_payouts'
      AND column_name  = 'amount'
  ) THEN
    UPDATE affiliate_payouts
    SET
      total_amount  = COALESCE(total_amount,  amount),
      payout_method = COALESCE(payout_method, method),
      stripe_memo   = COALESCE(stripe_memo,   memo)
    WHERE
      (total_amount IS NULL AND amount IS NOT NULL)
      OR (payout_method IS NULL AND method IS NOT NULL)
      OR (stripe_memo IS NULL AND memo IS NOT NULL);
  END IF;
END;
$$;

-- Drop old columns (no-op if already absent from the correct migration)
ALTER TABLE affiliate_payouts DROP COLUMN IF EXISTS amount;
ALTER TABLE affiliate_payouts DROP COLUMN IF EXISTS method;
ALTER TABLE affiliate_payouts DROP COLUMN IF EXISTS memo;
ALTER TABLE affiliate_payouts DROP COLUMN IF EXISTS stripe_transfer_id;

-- Add NOT NULL constraints now that data is migrated.
-- These will fail if any rows still have NULL in required columns after migration.
-- If that happens, investigate the data before re-running.
ALTER TABLE affiliate_payouts ALTER COLUMN total_amount  SET NOT NULL;
ALTER TABLE affiliate_payouts ALTER COLUMN payout_method SET NOT NULL;
ALTER TABLE affiliate_payouts ALTER COLUMN payout_handle SET NOT NULL;

-- period is required for new rows but we cannot enforce NOT NULL retroactively
-- on existing rows without a default. Set a sentinel for any legacy rows.
UPDATE affiliate_payouts SET period = 'legacy' WHERE period IS NULL;
ALTER TABLE affiliate_payouts ALTER COLUMN period SET NOT NULL;

-- Ensure affiliate_id is NOT NULL (was nullable in the wrong fresh_install.sql)
-- This will fail if any rows have NULL affiliate_id -- investigate before re-running.
ALTER TABLE affiliate_payouts ALTER COLUMN affiliate_id SET NOT NULL;

-- Add index if not already present
CREATE INDEX IF NOT EXISTS idx_payouts_affiliate ON affiliate_payouts(affiliate_id);
