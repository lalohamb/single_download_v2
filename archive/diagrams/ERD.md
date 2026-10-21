# Entity Relationship Diagram — POD Storefront

```mermaid
erDiagram

  %% ── AUTH ──────────────────────────────────────────────────────────────────
  AUTH_USERS {
    uuid   id PK
    text   email
  }

  %% ── IDENTITY & ACCESS ─────────────────────────────────────────────────────
  ADMINS {
    uuid        id        PK  "= auth.uid()"
    text        email
    text        role          "admin | super_admin"
    timestamptz created_at
  }

  CUSTOMER_PROFILES {
    uuid        id        PK  "FK → auth.users"
    text        email
    text        username
    text        full_name
    text        phone
    boolean     newsletter_opt_in
    jsonb       address
    jsonb       preferences
    timestamptz last_seen_at
    timestamptz created_at
    timestamptz updated_at
  }

  %% ── CATALOGUE ─────────────────────────────────────────────────────────────
  CATEGORIES {
    uuid        id          PK
    text        name
    text        slug
    text        description
    timestamptz created_at
  }

  PRODUCTS {
    uuid        id                PK
    text        printify_id
    text        title
    text        description
    uuid        category_id       FK
    numeric     price
    numeric     cost
    text        image_url
    jsonb       images
    text        status            "active | draft | archived"
    boolean     featured
    boolean     is_new_arrival
    boolean     is_trending
    boolean     is_bestseller
    boolean     is_on_sale
    boolean     content_locked
    text        blueprint_id
    text        print_provider_id
    jsonb       variants
    jsonb       shipping_info
    timestamptz created_at
    timestamptz updated_at
  }

  %% ── COMMERCE ──────────────────────────────────────────────────────────────
  ORDERS {
    uuid        id                       PK
    text        stripe_session_id
    text        stripe_payment_intent_id
    text        printify_order_id
    text        email
    text        shipping_name
    jsonb       shipping_address
    text        shipping_method
    numeric     shipping_cost
    numeric     subtotal
    numeric     total
    text        currency
    text        status                   "pending | paid | cancelled | fulfilled"
    text        fulfillment_status       "pending | shipped | fulfilled"
    text        tracking_number
    text        tracking_url
    jsonb       items
    text        affiliate_code
    text        utm_source
    text        utm_medium
    text        utm_campaign
    boolean     livemode
    timestamptz created_at
    timestamptz updated_at
  }

  %% ── AFFILIATE PROGRAM ─────────────────────────────────────────────────────
  AFFILIATES {
    uuid        id              PK
    text        email
    text        name
    text        code
    text        status          "pending | active | suspended | rejected"
    numeric     commission_rate
    text        payout_method
    text        payout_handle
    text        platform_url
    int         follower_count
    int         total_views
    text        notes
    timestamptz created_at
  }

  AFFILIATE_CLICKS {
    uuid        id         PK
    text        code
    text        referrer
    text        user_agent
    timestamptz created_at
  }

  AFFILIATE_CONVERSIONS {
    uuid        id               PK
    uuid        affiliate_id     FK
    uuid        order_id         FK
    numeric     order_subtotal
    numeric     commission_amount
    text        status           "pending | approved | paid | voided"
    timestamptz approved_at
    timestamptz paid_at
    uuid        payout_id        FK
    timestamptz created_at
  }

  AFFILIATE_PAYOUTS {
    uuid        id            PK
    uuid        affiliate_id  FK
    text        period
    numeric     total_amount
    text        payout_method
    text        payout_handle
    text        stripe_memo
    text        status        "pending | paid"
    timestamptz paid_at
    timestamptz created_at
  }

  %% ── CONFIGURATION (singleton rows) ───────────────────────────────────────
  SETTINGS {
    uuid        id                      PK
    text        store_name
    text        tagline
    text        hero_image_url
    text        hero_title
    text        hero_subtitle
    text        announcement
    boolean     announcement_active
    text        logo_url
    numeric     logo_size
    numeric     shipping_free_threshold
    numeric     default_shipping_cost
    boolean     printify_connected
    text        printify_shop_id
    boolean     stripe_connected
    text        stripe_live_secret_key
    text        stripe_live_webhook_secret
    text        stripe_test_secret_key
    text        stripe_test_webhook_secret
    text        resend_api_key
    jsonb       social_links
    jsonb       testimonials
    jsonb       about_settings
    jsonb       affirmations_settings
    jsonb       new_arrivals_settings
    jsonb       brand_values_settings
    jsonb       music_tracks
    boolean     music_shuffle
    timestamptz updated_at
  }

  SEO_SETTINGS {
    uuid        id                       PK
    text        site_url
    text        default_og_image
    boolean     sitemap_enabled
    boolean     robots_noindex_admin
    boolean     jsonld_enabled
    boolean     canonical_enabled
    text        meta_title_suffix
    text        twitter_handle
    text        google_site_verification
    text        facebook_domain_verification
    text        ga4_measurement_id
    text        facebook_pixel_id
    timestamptz updated_at
  }

  POLICIES {
    text        id          PK  "terms | privacy | refund"
    text        title
    text        content
    boolean     locked
    timestamptz updated_at
  }

  %% ── EMAIL AUDIT ───────────────────────────────────────────────────────────
  EMAIL_EVENTS {
    uuid        id          PK
    text        resend_id
    text        to_email
    text        subject
    text        event_type  "sent | delivered | opened | clicked | bounced | complained"
    timestamptz created_at
  }

  %% ── RELATIONSHIPS ─────────────────────────────────────────────────────────
  AUTH_USERS         ||--o| ADMINS              : "1:0..1  (admin role)"
  AUTH_USERS         ||--o| CUSTOMER_PROFILES   : "1:0..1  (customer account)"

  CATEGORIES         ||--o{ PRODUCTS            : "1:N  category_id"

  ORDERS             }o--o| AFFILIATES          : "N:0..1  affiliate_code"
  AFFILIATES         ||--o{ AFFILIATE_CLICKS    : "1:N  code"
  AFFILIATES         ||--o{ AFFILIATE_CONVERSIONS : "1:N  affiliate_id"
  AFFILIATES         ||--o{ AFFILIATE_PAYOUTS   : "1:N  affiliate_id"
  ORDERS             ||--o{ AFFILIATE_CONVERSIONS : "1:N  order_id"
  AFFILIATE_PAYOUTS  ||--o{ AFFILIATE_CONVERSIONS : "1:N  payout_id"
```

---

## Table Ownership & Access Summary

| Table | Public Read | Customer Read | Admin Write | Notes |
|---|:---:|:---:|:---:|---|
| `auth.users` | — | own row | — | Supabase managed |
| `admins` | ✗ | own row | super_admin only | |
| `customer_profiles` | ✗ | own row | ✓ (read) | |
| `categories` | ✓ | ✓ | ✓ | |
| `products` | ✓ | ✓ | ✓ | |
| `orders` | INSERT only | ✗ | ✓ | No public SELECT |
| `affiliates` | INSERT only | ✗ | ✓ | Signup is public |
| `affiliate_clicks` | INSERT only | ✗ | ✓ (read) | |
| `affiliate_conversions` | ✗ | ✗ | ✓ | |
| `affiliate_payouts` | ✗ | ✗ | ✓ | |
| `settings` | ✓ ⚠️ | ✓ ⚠️ | UPDATE only | GAP-012: secrets exposed via `select("*")` |
| `seo_settings` | ✓ | ✓ | ✓ | |
| `policies` | ✓ | ✓ | ✓ | |
| `email_events` | ✗ | ✗ | ✓ | |

> ⚠️ `settings` public read includes Stripe/Resend secret columns. Migration `20261017000000_restrict_settings_stripe_keys.sql` + `settings_public` view are the fix (pending deploy).

---

## External Service Connections

```
Next.js App (VPS)
  ├── Supabase DB          — all table reads/writes via supabase-js
  ├── Supabase Edge Fns    — stripe-checkout, stripe-webhook, printify-proxy, printify-webhook
  ├── Stripe               — payment sessions, webhooks
  ├── Printify             — product sync, order fulfillment, webhooks
  ├── Resend               — transactional email (order confirm, shipping)
  └── MailerLite           — newsletter subscriber list
```
