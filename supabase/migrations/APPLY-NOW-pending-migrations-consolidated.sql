-- ============================================================
-- BODYANDSLEEVES — PENDING MIGRATIONS + SETTINGS_PUBLIC FIX
-- Run this entire script in Supabase SQL Editor
-- Date: 2025-07-29
-- Fixes: GAP-001, GAP-004, GAP-012, GAP-019 + settings_public view gaps
-- ============================================================


-- ============================================================
-- STEP 1: Ensure all settings columns exist before building the view
-- (idempotent — safe to run even if columns already exist)
-- ============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS music_url text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS music_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS music_tracks jsonb NOT NULL DEFAULT '[]';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS music_shuffle boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS video_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS video_tracks jsonb NOT NULL DEFAULT '[]';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS facebook_domain_verification text DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS site_menu_settings jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS popup_settings jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS product_badge_1_text text DEFAULT 'Free shipping on orders over $75';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS product_badge_1_active boolean DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS product_badge_2_text text DEFAULT 'Print on demand - made fresh for you';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS product_badge_2_active boolean DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS product_badge_3_text text DEFAULT 'Premium quality guarantee';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS product_badge_3_active boolean DEFAULT true;


-- ============================================================
-- STEP 2: Restrict settings SELECT, rebuild settings_public view
-- ============================================================

DROP POLICY IF EXISTS "public_read_settings" ON settings;
CREATE POLICY "public_read_settings" ON settings FOR SELECT
  TO anon, authenticated
  USING (false);

DROP VIEW IF EXISTS settings_public;
CREATE VIEW settings_public AS
SELECT
  id,
  store_name,
  tagline,
  hero_image_url,
  hero_object_position,
  hero_title,
  hero_subtitle,
  hero_height_vh,
  hero_image_flip,
  hero_image_scale,
  hero_gradient_opacity,
  hero_gradient_dir,
  hero_image_fit,
  story_image_url,
  story_object_position,
  story_image_scale,
  story_image_flip,
  story_image_fit,
  story_gradient_opacity,
  story_gradient_dir,
  logo_url,
  logo_size,
  footer_text,
  footer_bottom_message,
  footer_logo_url,
  footer_logo_size,
  about_settings,
  affirmations_settings,
  new_arrivals_settings,
  brand_values_settings,
  feature_strip_settings,
  site_menu_settings,
  popup_settings,
  testimonials,
  promo_banner_active,
  promo_banner_title,
  promo_banner_body,
  promo_banner_cta_label,
  promo_banner_cta_url,
  promo_banner_bg_color,
  promo_banner_max_shows,
  our_why_image_url,
  our_why_object_position,
  our_why_height_vh,
  our_why_label,
  our_why_quote,
  our_why_body,
  our_why_image_scale,
  our_why_image_flip,
  our_why_image_fit,
  our_why_gradient_opacity,
  our_why_gradient_dir,
  announcement,
  announcement_active,
  orders_paused,
  shipping_free_threshold,
  default_shipping_cost,
  product_badge_1_text,
  product_badge_1_active,
  product_badge_2_text,
  product_badge_2_active,
  product_badge_3_text,
  product_badge_3_active,
  printify_connected,
  printify_shop_id,
  stripe_connected,
  stripe_mode,
  social_links,
  favicon_url,
  newsletter_group_id,
  affiliate_program_enabled,
  music_url,
  music_enabled,
  music_tracks,
  music_shuffle,
  video_enabled,
  video_tracks,
  facebook_domain_verification,
  singleton,
  updated_at
FROM settings;

GRANT SELECT ON settings_public TO anon, authenticated;
ALTER VIEW settings_public OWNER TO postgres;
REVOKE ALL ON settings_public FROM PUBLIC;
GRANT SELECT ON settings_public TO anon, authenticated;

GRANT SELECT ON settings_public TO anon, authenticated;
ALTER VIEW settings_public OWNER TO postgres;
REVOKE ALL ON settings_public FROM PUBLIC;
GRANT SELECT ON settings_public TO anon, authenticated;


-- ============================================================
-- STEP 3: 20261018 — Fix affiliate_payouts schema
-- ============================================================

ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS period        text;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS total_amount  numeric;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS payout_method text;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS payout_handle text;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS stripe_memo   text;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'pending';
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS paid_at       timestamptz;

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

ALTER TABLE affiliate_payouts DROP COLUMN IF EXISTS amount;
ALTER TABLE affiliate_payouts DROP COLUMN IF EXISTS method;
ALTER TABLE affiliate_payouts DROP COLUMN IF EXISTS memo;
ALTER TABLE affiliate_payouts DROP COLUMN IF EXISTS stripe_transfer_id;


-- ============================================================
-- STEP 4: 20261019 — Add user_id FK to orders
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);


-- ============================================================
-- STEP 5: 20261020 — Fix admins PK + update ALL RLS policies
-- This is the critical fix — restores all admin write access
-- ============================================================

-- Add auth_user_id column
ALTER TABLE admins ADD COLUMN IF NOT EXISTS auth_user_id uuid;
UPDATE admins SET auth_user_id = id WHERE auth_user_id IS NULL;
ALTER TABLE admins ALTER COLUMN auth_user_id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE admins ADD CONSTRAINT admins_auth_user_id_unique UNIQUE (auth_user_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL;
END $$;

-- Add independent PK column
ALTER TABLE admins ADD COLUMN IF NOT EXISTS new_id uuid DEFAULT gen_random_uuid();
UPDATE admins SET new_id = gen_random_uuid() WHERE new_id IS NULL;

-- Swap PK (skip if already done)
DO $$ BEGIN
  ALTER TABLE admins DROP CONSTRAINT admins_pkey;
  ALTER TABLE admins RENAME COLUMN id TO old_auth_id;
  ALTER TABLE admins RENAME COLUMN new_id TO id;
  ALTER TABLE admins ADD PRIMARY KEY (id);
  ALTER TABLE admins DROP COLUMN IF EXISTS old_auth_id CASCADE;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'admins PK swap already applied — skipping';
END $$;

-- Performance index
CREATE INDEX IF NOT EXISTS idx_admins_auth_user_id ON admins(auth_user_id);

-- admins table RLS
DROP POLICY IF EXISTS "auth_read_admins" ON admins;
CREATE POLICY "auth_read_admins" ON admins FOR SELECT
  TO authenticated USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "super_admin_insert_admins" ON admins;
CREATE POLICY "super_admin_insert_admins" ON admins FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins a WHERE a.auth_user_id = auth.uid() AND a.role = 'super_admin')
  );

DROP POLICY IF EXISTS "super_admin_delete_admins" ON admins;
CREATE POLICY "super_admin_delete_admins" ON admins FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins a WHERE a.auth_user_id = auth.uid() AND a.role = 'super_admin')
  );

-- products RLS
DROP POLICY IF EXISTS "admin_insert_products" ON products;
CREATE POLICY "admin_insert_products" ON products FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_update_products" ON products;
CREATE POLICY "admin_update_products" ON products FOR UPDATE
  TO authenticated
  USING     (EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_delete_products" ON products;
CREATE POLICY "admin_delete_products" ON products FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

-- orders RLS
DROP POLICY IF EXISTS "admin_read_orders" ON orders;
CREATE POLICY "admin_read_orders" ON orders FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_update_orders" ON orders;
CREATE POLICY "admin_update_orders" ON orders FOR UPDATE
  TO authenticated
  USING     (EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_delete_orders" ON orders;
CREATE POLICY "admin_delete_orders" ON orders FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );

-- settings RLS — THE CRITICAL FIX
DROP POLICY IF EXISTS "admin_update_settings" ON settings;
CREATE POLICY "admin_update_settings" ON settings FOR UPDATE
  TO authenticated
  USING     (EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_insert_settings" ON settings;
CREATE POLICY "admin_insert_settings" ON settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.auth_user_id = auth.uid())
  );


-- ============================================================
-- VERIFICATION — run after the above to confirm it worked
-- ============================================================
-- SELECT id, auth_user_id, email, role FROM admins;
-- Should show your admin row with both id (new uuid) and auth_user_id (your auth uuid)
