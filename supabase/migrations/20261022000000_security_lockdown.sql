-- Migration: 20261022000000_security_lockdown.sql
-- Security batch 1 from the 2026-10-21 review. Safe to re-run.
--
-- 1. insert_admin_row: callable by service_role only (anon/customers could
--    make themselves super_admin).
-- 2. is_admin(): match on admins.auth_user_id (admins.id stopped being the
--    auth uid in 20261020000000) and pin search_path.
-- 3. seo_settings: public read only. The old "admins_all" policy let anyone
--    write tracking IDs that are rendered into inline scripts. Writes go
--    through /api/seo, which uses the service role.
-- 4. Drop open INSERT policies on orders, affiliates, affiliate_clicks. All
--    legitimate inserts use the service role (stripe-checkout, signup, track).
-- 5. Restore admin policies that DROP COLUMN ... CASCADE removed in
--    20261020000000: categories, policies, email_events, customer_profiles.
-- 6. settings: admins can see the row so browser UPDATE ... WHERE id matches
--    it; anon/authenticated can never read the secret columns.

BEGIN;

-- 1. insert_admin_row --------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.insert_admin_row(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_admin_row(uuid, text, text) TO service_role;

-- 2. is_admin() --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE auth_user_id = auth.uid());
$$;

-- 3. seo_settings ------------------------------------------------------------
DROP POLICY IF EXISTS "admins_all" ON public.seo_settings;
DROP POLICY IF EXISTS "public_read_seo_settings" ON public.seo_settings;
DROP POLICY IF EXISTS "admin_update_seo_settings" ON public.seo_settings;
CREATE POLICY "public_read_seo_settings" ON public.seo_settings
  FOR SELECT TO anon, authenticated USING (true);

-- 4. open INSERT policies ----------------------------------------------------
DROP POLICY IF EXISTS "public_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "public_insert_affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "public_insert_clicks" ON public.affiliate_clicks;

-- 5. admin policies lost in 20261020000000 -----------------------------------
DROP POLICY IF EXISTS "admin_insert_categories" ON public.categories;
CREATE POLICY "admin_insert_categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_update_categories" ON public.categories;
CREATE POLICY "admin_update_categories" ON public.categories
  FOR UPDATE TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_delete_categories" ON public.categories;
CREATE POLICY "admin_delete_categories" ON public.categories
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_insert_policies" ON public.policies;
CREATE POLICY "admin_insert_policies" ON public.policies
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_update_policies" ON public.policies;
CREATE POLICY "admin_update_policies" ON public.policies
  FOR UPDATE TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_read_email_events" ON public.email_events;
CREATE POLICY "admin_read_email_events" ON public.email_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin_read_customer_profiles" ON public.customer_profiles;
CREATE POLICY "admin_read_customer_profiles" ON public.customer_profiles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()));

-- 6. settings ----------------------------------------------------------------
DROP POLICY IF EXISTS "admin_read_settings" ON public.settings;
CREATE POLICY "admin_read_settings" ON public.settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.auth_user_id = auth.uid()));

DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'settings'
    AND column_name NOT IN ('stripe_live_secret_key', 'stripe_live_webhook_secret',
                            'stripe_test_secret_key', 'stripe_test_webhook_secret', 'resend_api_key');
  EXECUTE 'REVOKE SELECT ON public.settings FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.settings TO anon, authenticated', cols);
END $$;

COMMIT;
