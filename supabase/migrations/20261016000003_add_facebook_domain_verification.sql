ALTER TABLE seo_settings
  ADD COLUMN IF NOT EXISTS facebook_domain_verification text DEFAULT '';
