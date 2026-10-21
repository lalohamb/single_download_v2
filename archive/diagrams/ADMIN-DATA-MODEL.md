# Admin Data Model — Settings & SEO

The `settings` table is a single-row configuration store. This diagram groups its columns by feature area to make the admin panel easier to navigate.

---

## settings Table — Grouped by Feature Area

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BRAND & STORE IDENTITY                                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  store_name          text                                                   │
│  tagline             text                                                   │
│  logo_url            text                                                   │
│  logo_size           numeric                                                │
│  favicon_url         text                                                   │
│  social_links        jsonb  { instagram, tiktok, facebook, twitter,         │
│                               youtube, pinterest }                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  HERO SECTION                                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  hero_image_url        text                                                 │
│  hero_object_position  text                                                 │
│  hero_title            text                                                 │
│  hero_subtitle         text                                                 │
│  hero_height_vh        numeric                                              │
│  hero_image_flip       boolean                                              │
│  hero_image_scale      numeric                                              │
│  hero_gradient_opacity numeric                                              │
│  hero_gradient_dir     text                                                 │
│  hero_image_fit        text                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  STORY / OUR WHY SECTION                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  story_image_url         text                                               │
│  story_object_position   text                                               │
│  story_image_scale       numeric                                            │
│  story_image_flip        boolean                                            │
│  story_image_fit         text                                               │
│  story_gradient_opacity  numeric                                            │
│  story_gradient_dir      text                                               │
│  our_why_image_url       text                                               │
│  our_why_object_position text                                               │
│  our_why_height_vh       numeric                                            │
│  our_why_label           text                                               │
│  our_why_quote           text                                               │
│  our_why_body            text                                               │
│  our_why_image_scale     numeric                                            │
│  our_why_image_flip      boolean                                            │
│  our_why_image_fit       text                                               │
│  our_why_gradient_opacity numeric                                           │
│  our_why_gradient_dir    text                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  ANNOUNCEMENT & PROMO BANNER                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│  announcement            text                                               │
│  announcement_active     boolean                                            │
│  promo_banner_active     boolean                                            │
│  promo_banner_title      text                                               │
│  promo_banner_body       text                                               │
│  promo_banner_cta_label  text                                               │
│  promo_banner_cta_url    text                                               │
│  promo_banner_bg_color   text                                               │
│  promo_banner_max_shows  int                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  FOOTER                                                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  footer_text             text                                               │
│  footer_bottom_message   text                                               │
│  footer_logo_url         text                                               │
│  footer_logo_size        numeric                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  CONTENT SECTIONS (jsonb blobs)                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  about_settings          jsonb  { enabled, title, body, image_url, ... }    │
│  affirmations_settings   jsonb  { enabled, items: [{ text }] }              │
│  new_arrivals_settings   jsonb  { enabled, title, subtitle }                │
│  brand_values_settings   jsonb  { enabled, items: [{ icon, title, body }] } │
│  feature_strip_settings  jsonb  { enabled, items: [{ icon, text }] }        │
│  testimonials            jsonb  [{ quote, name, location, product }]        │
│  about_settings          jsonb  (see above)                                 │
│  popup_settings          jsonb  { enabled, delay_ms, ... }                  │
│  site_menu_settings      jsonb  { items: [{ label, href }] }                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  MUSIC PLAYER                                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  music_tracks            jsonb  [{ title, artist, url }]                    │
│  music_shuffle           boolean                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  SHIPPING                                                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  shipping_free_threshold  numeric  (default: 75.00)                         │
│  default_shipping_cost    numeric  (default: 6.99)                          │
│  orders_paused            boolean                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  PRINTIFY INTEGRATION                                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│  printify_connected       boolean                                           │
│  printify_shop_id         text                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  STRIPE INTEGRATION  (⚠️ secret columns — excluded from settings_public)    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  stripe_connected          boolean                                          │
│  stripe_mode               text  'test' | 'live'                            │
│  stripe_live_secret_key    text  ← EXCLUDED from settings_public view       │
│  stripe_live_webhook_secret text ← EXCLUDED from settings_public view       │
│  stripe_test_secret_key    text  ← EXCLUDED from settings_public view       │
│  stripe_test_webhook_secret text ← EXCLUDED from settings_public view       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  EMAIL                                                                      │
│  ─────────────────────────────────────────────────────────────────────────  │
│  resend_api_key           text  ⚠️ still in settings_public — needs fix     │
│  email_from               text                                              │
│  email_support            text                                              │
│  newsletter_group_id      text  (MailerLite group ID)                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  AFFILIATE PROGRAM                                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  affiliate_program_enabled boolean                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  TRACKING & VERIFICATION                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  facebook_domain_verification text  (stored in settings)                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## seo_settings Table

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  seo_settings  (single row — id fixed: 000...0001)                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  CORE                                                                       │
│  site_url                  text   'https://bodyandsleeves.com'              │
│  default_og_image          text   (fallback OG image URL)                   │
│  meta_title_suffix         text   '| Body & Sleeves'                        │
│  twitter_handle            text   '@yourstore' ⚠️ placeholder not updated   │
│                                                                             │
│  FEATURE FLAGS                                                              │
│  sitemap_enabled           boolean  (controls /sitemap.xml output)          │
│  robots_noindex_admin      boolean  (adds noindex to /admin/*)              │
│  jsonld_enabled            boolean  (controls JSON-LD on product pages)     │
│  canonical_enabled         boolean  (controls canonical tags)               │
│                                                                             │
│  VERIFICATION TAGS                                                          │
│  google_site_verification  text   (meta tag value)                          │
│  facebook_domain_verification text (meta tag value — also in settings)      │
│  ga4_measurement_id        text   (G-XXXXXXXX)                              │
│  facebook_pixel_id         text   (numeric pixel ID)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Admin Panel → DB Write Map

| Admin Panel Route | Table Written | Key Columns |
|---|---|---|
| `/admin/settings` | `settings` | brand, hero, story, footer, social_links, content sections |
| `/admin/seo` | `seo_settings` | site_url, meta_title_suffix, feature flags, verification tags |
| `/admin/shipping` | `settings` | shipping_free_threshold, default_shipping_cost, orders_paused |
| `/admin/email` | `settings` | email_from, email_support, resend_api_key, newsletter_group_id |
| `/admin/stripe` | `settings` | stripe_mode, stripe_*_secret_key, stripe_*_webhook_secret |
| `/admin/products` | `products` | title, description, status, featured, content_locked, flags |
| `/admin/categories` | `categories` | name, slug, description |
| `/admin/orders` | `orders` | status, fulfillment_status, tracking_* |
| `/admin/policies` | `policies` | content, locked |
| `/admin/affiliates` | `affiliates`, `affiliate_conversions`, `affiliate_payouts` | status, approved_at, paid_at |
| `/admin/media` | Supabase Storage | image files → URL stored in settings |
| `/admin/mailerlite` | `settings` | newsletter_group_id |
