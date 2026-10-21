-- Add product badge columns to settings (and settings_public view)
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS product_badge_1_text   text    DEFAULT 'Free shipping on orders over $75',
  ADD COLUMN IF NOT EXISTS product_badge_1_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_badge_2_text   text    DEFAULT 'Print on demand - made fresh for you',
  ADD COLUMN IF NOT EXISTS product_badge_2_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_badge_3_text   text    DEFAULT 'Premium quality guarantee',
  ADD COLUMN IF NOT EXISTS product_badge_3_active boolean DEFAULT true;
