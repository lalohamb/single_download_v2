-- M1A GAP-012: Restrict secret columns from public settings SELECT.
--
-- The four Stripe secret columns stay in the settings table (required for the
-- admin mode-switch feature per ADR-004). This migration replaces the
-- unrestricted public_read_settings policy with a security-definer view that
-- exposes only storefront-safe columns.
--
-- COLUMNS EXCLUDED from the public view:
--   stripe_live_secret_key     (Critical)
--   stripe_live_webhook_secret (Critical)
--   stripe_test_secret_key     (Critical)
--   stripe_test_webhook_secret (Critical)
--   resend_api_key             (High -- can send email from verified domain)
--   email_from                 (operational config, not needed by storefront anon reads)
--   email_support              (operational config, not needed by storefront anon reads)
--
-- M1A implementation note: the original draft of this migration included
-- resend_api_key, email_from, and email_support in the view. That was a defect.
-- This corrected version excludes all three.
--
-- What changes:
--   - public_read_settings policy: replaced with USING (false) -- direct table
--     SELECT by anon/authenticated is blocked.
--   - settings_public view: security-definer view with storefront-safe columns only.
--   - Service role (used by stripe-config.ts and all admin routes) bypasses RLS
--     entirely -- no change required in application code.
--
-- What does NOT change:
--   - stripe-config.ts reads secret columns via service role -- unaffected.
--   - Admin API routes use service role -- unaffected.
--   - admin/email/page.tsx reads resend_api_key via admin session (service role) -- unaffected.
--   - Storefront reads of store_name, hero_*, social_links, etc. must use the
--     settings_public view going forward (or continue via service role).

-- 1. Replace the unrestricted public SELECT policy with a deny policy.
--    Service role bypasses this entirely. Anon/authenticated must use the view.
DROP POLICY IF EXISTS "public_read_settings" ON settings;
CREATE POLICY "public_read_settings" ON settings FOR SELECT
  TO anon, authenticated
  USING (false);

-- 2. Drop and recreate the security-definer view with storefront-safe columns only.
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
  -- stripe_live_secret_key     EXCLUDED (Critical)
  -- stripe_live_webhook_secret EXCLUDED (Critical)
  -- stripe_test_secret_key     EXCLUDED (Critical)
  -- stripe_test_webhook_secret EXCLUDED (Critical)
  -- resend_api_key             EXCLUDED (High -- can send email from verified domain)
  -- email_from                 EXCLUDED (operational config)
  -- email_support              EXCLUDED (operational config)
  social_links,
  favicon_url,
  site_menu_settings,
  newsletter_group_id,
  popup_settings,
  affiliate_program_enabled,
  singleton,
  updated_at
FROM settings;

-- 3. Grant SELECT on the view to anon and authenticated.
GRANT SELECT ON settings_public TO anon, authenticated;

-- 4. Make the view security-definer so it runs as the view owner (postgres),
--    bypassing RLS on the underlying settings table.
ALTER VIEW settings_public OWNER TO postgres;
REVOKE ALL ON settings_public FROM PUBLIC;
GRANT SELECT ON settings_public TO anon, authenticated;
