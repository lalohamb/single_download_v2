# Transfer Prompt — SEO, Analytics & Checkout UX

Apply the following features to this Next.js 15 / Supabase / Stripe storefront codebase.
Do NOT modify any product, store settings, Printify, or fulfillment logic.

---

## 1. Database Migrations

Run these SQL migrations in order against your Supabase project.
Each uses `IF NOT EXISTS` / `IF NOT EXISTS` so they are safe to run on a fresh or existing DB.

### 1a. seo_settings table
```sql
create table if not exists seo_settings (
  id uuid primary key default gen_random_uuid(),
  site_url text not null default 'https://your-store.example',
  default_og_image text,
  sitemap_enabled boolean not null default true,
  robots_noindex_admin boolean not null default true,
  jsonld_enabled boolean not null default true,
  canonical_enabled boolean not null default true,
  meta_title_suffix text not null default '| Your Store',
  twitter_handle text default '@yourstore',
  google_site_verification text,
  updated_at timestamptz not null default now()
);

insert into seo_settings (id) values ('00000000-0000-0000-0000-000000000001')
  on conflict (id) do nothing;

alter table seo_settings enable row level security;
create policy "admins_all" on seo_settings for all using (true) with check (true);
```

### 1b. Add Facebook Pixel ID to seo_settings
```sql
alter table seo_settings add column if not exists facebook_pixel_id text default '';
```

### 1c. Add GA4 Measurement ID to seo_settings
```sql
alter table seo_settings add column if not exists ga_measurement_id text default '';
```

### 1d. Add Facebook Domain Verification to seo_settings
```sql
alter table seo_settings add column if not exists facebook_domain_verification text default '';
```

### 1e. Add discount fields to orders
```sql
alter table orders
  add column if not exists discount_code text,
  add column if not exists discount_amount numeric(10,2) default 0;
```

### 1f. Add UTM attribution + marketing consent to orders
```sql
alter table orders
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists utm_source       text,
  add column if not exists utm_medium       text,
  add column if not exists utm_campaign     text,
  add column if not exists utm_content      text,
  add column if not exists utm_term         text,
  add column if not exists referrer         text,
  add column if not exists landing_page     text,
  add column if not exists first_touch      jsonb,
  add column if not exists last_touch       jsonb;

create index if not exists idx_orders_utm_source      on orders(utm_source);
create index if not exists idx_orders_utm_campaign    on orders(utm_campaign);
create index if not exists idx_orders_marketing_optin on orders(marketing_opt_in);
```

### 1g. Add shipments column to orders
```sql
alter table orders add column if not exists shipments jsonb default '[]'::jsonb;
```

---

## 2. Facebook Pixel component

Create `src/components/FacebookPixel.tsx`:

- `"use client"` component
- Accepts `pixelId: string` prop — returns null if empty
- Injects the standard Facebook Pixel `<Script>` via `next/script` with `strategy="afterInteractive"`
- Initialises with `fbq('init', pixelId)` and `fbq('track', 'PageView')`
- Uses `usePathname()` to fire `fbq('track', 'PageView')` on every client-side route change (skip first render, skip if pathname unchanged)
- Exports a named `fbq(...args)` helper that safely calls `window.fbq` if available
- Includes a `<noscript>` fallback img tag: `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`

---

## 3. Google Analytics 4 component

Create `src/components/GoogleAnalytics.tsx`:

- `"use client"` component
- Accepts `measurementId: string` prop — returns null if empty
- Loads `https://www.googletagmanager.com/gtag/js?id=${measurementId}` via `next/script` with `strategy="afterInteractive"`
- Second script initialises `window.dataLayer` and `gtag` with `send_page_view: false`
- Uses `usePathname()` + `useEffect` to call `trackPageView(pathname, measurementId)` on every route change

---

## 4. Analytics event library

Create `src/lib/analytics.ts`:

Declare `window.gtag` and `window.dataLayer` on the global Window interface.

Export these functions — all safely no-op if `window.gtag` is unavailable:

- `gtag(...args)` — raw wrapper
- `trackPageView(url, measurementId)` — `gtag('config', measurementId, { page_path: url })`
- `trackViewItem({ id, title, price, category? })` — GA4 `view_item` ecommerce event
- `trackAddToCart({ id, title, price, variantId, variantLabel, quantity })` — GA4 `add_to_cart`
- `trackBeginCheckout(items[], value)` — GA4 `begin_checkout`
- `trackPurchase(orderId, value, items[])` — GA4 `purchase`
- `trackSearch(searchTerm)` — GA4 `search`
- `trackSignUp(method?)` — GA4 `sign_up`
- `trackGenerateLead()` — GA4 `generate_lead`

All ecommerce events use `currency: "USD"` and map items to GA4 format: `item_id`, `item_name`, `item_variant`, `price`, `quantity`.

---

## 5. Root layout — inject pixel and GA4

In `src/app/layout.tsx`:

**generateMetadata():**
- Fetch from `seo_settings`: `google_site_verification`, `twitter_handle`, `meta_title_suffix`, `facebook_pixel_id`, `facebook_domain_verification`
- Fetch from `settings`: `store_name`, `favicon_url`
- Return Metadata:
  - `title.default` = store name, `title.template` = `%s ${meta_title_suffix}`
  - `openGraph`: `siteName`, `type: "website"`
  - If `twitter_handle`: `twitter: { card: "summary_large_image", site: handle }`
  - If `google_site_verification`: `verification: { google: code }`
  - If `facebook_domain_verification`: `other: { "facebook-domain-verification": code }`

**RootLayout:**
- Fetch `facebook_pixel_id` and `ga_measurement_id` from `seo_settings`
- Render `<FacebookPixel pixelId={pixelId} />` and `<GoogleAnalytics measurementId={gaMeasurementId} />` inside the body when IDs are non-empty

---

## 6. Sitemap

Create `src/app/sitemap.ts`:

- `export const revalidate = 3600`
- Fetch `site_url` and `sitemap_enabled` from `seo_settings` (anon client)
- Return `[]` if `sitemap_enabled` is false
- Static routes: `/` (priority 1, daily), `/shop` (0.9, daily), `/about` (0.6, monthly), `/refund-policy` (0.3, yearly), `/terms-of-service` (0.3, yearly)
- Dynamic routes: all active products as `/product/${id}` (priority 0.8, weekly, `lastModified` from `updated_at`)

---

## 7. Robots.txt

Create `src/app/robots.ts`:

- `export const revalidate = 3600`
- Fetch `site_url` and `robots_noindex_admin` from `seo_settings`
- Always disallow `/checkout/` and `/api/`
- If `robots_noindex_admin` is true, also disallow `/admin/`
- Set `sitemap` to `${site_url}/sitemap.xml`

---

## 8. SEO API route

Create `src/app/api/seo/route.ts` with `export const runtime = "nodejs"`:

**GET:**
- `?action=sitemap_products` → return active products `id` + `updated_at`
- Otherwise → return full `seo_settings` row

**POST (admin only — call `requireAdmin()` first):**
- Allowlisted fields only: `site_url`, `default_og_image`, `sitemap_enabled`, `robots_noindex_admin`, `jsonld_enabled`, `canonical_enabled`, `meta_title_suffix`, `twitter_handle`, `google_site_verification`, `facebook_pixel_id`, `ga_measurement_id`, `facebook_domain_verification`
- Update existing row or insert if none exists
- Use service role Supabase client for writes

---

## 9. Admin SEO page

Create `src/app/admin/seo/page.tsx` wrapped in `<ProtectedAdmin>`:

Sections (all save via POST to `/api/seo`, sticky Save button at bottom):

**Overview cards:** 4 cards — Sitemap, Robots.txt, JSON-LD, Canonical URLs — each shows Active/Disabled badge.

**Site Basics:** Production URL, Meta Title Suffix, Twitter/X Handle, Google Search Console Verification Code.

**Facebook Pixel:** Pixel ID input (monospace), green active indicator when filled, Domain Verification Code input with link to Meta Business Manager.

**Google Analytics 4:** Measurement ID input (monospace, placeholder `G-XXXXXXXXXX`), green active indicator when filled, link to Google Analytics Admin → Data Streams.

**Open Graph:** Default OG Image URL, live image preview, note about 1200×630px.

**SEO Feature Toggles:** Toggle switches for Sitemap XML, Robots.txt block, JSON-LD Product Schema, Canonical URLs.

**Sitemap Inspector:** "Check Sitemap" button (calls `GET /api/seo?action=sitemap_products`, shows URL count), links to view `/sitemap.xml` and `/robots.txt`.

**Google Search Console:** Step-by-step instructions for domain verification and sitemap submission.

---

## 10. Analytics event wiring

Wire up tracking calls throughout the app. These are required, not optional.

### Product detail page (`src/app/product/[id]/ProductDetailClient.tsx` or equivalent)
- On component mount (`useEffect` with empty deps), call:
  ```ts
  trackViewItem({ id: product.id, title: product.title, price: product.price })
  ```

### Add to cart action (wherever `addToCart` / cart context is called)
- Immediately after adding to cart, call:
  ```ts
  trackAddToCart({ id, title, price, variantId, variantLabel, quantity })
  ```

### Checkout page (`src/app/checkout/page.tsx`)
- Inside `handleSubmit`, before calling `createStripeCheckout`, call:
  ```ts
  trackBeginCheckout(
    items.map(i => ({ id: i.product_id, title: i.title, price: i.price, variantLabel: i.variant_label ?? '', quantity: i.quantity })),
    total
  )
  ```

### Checkout success page (`src/app/checkout/success/page.tsx`)
- After the order is confirmed and order data is available, call:
  ```ts
  trackPurchase(orderId, orderTotal, items.map(...))
  ```
- Fire this only once — use a `useRef` flag or check `sessionStorage` to prevent double-firing on re-renders.

### Shop page search (`src/app/shop/ShopClient.tsx` or equivalent)
- When the search input value changes (debounced, only when non-empty), call:
  ```ts
  trackSearch(searchTerm)
  ```

---

## 11. Checkout page — button position and style

In `src/app/checkout/page.tsx`:

**Layout:** Wrap the entire two-column grid in a single `<form onSubmit={handleSubmit}>`. Left column = contact + shipping fields only. Right column = order summary panel.

**Move inside the order summary panel** (below the totals): the error message, the pay button, and the disclaimer text.

**Button style** — do not use `btn-primary` or `btn-gold`. Apply inline styles:
```tsx
style={{
  background: "linear-gradient(135deg, #d4af37 0%, #f5d76e 40%, #c49b2c 100%)",
  boxShadow: "0 4px 20px rgba(212,175,55,0.5)"
}}
className="w-full mt-4 rounded-xl py-4 px-6 font-bold text-base text-white
           tracking-wide transition-all active:scale-[0.98]
           disabled:opacity-50 disabled:cursor-not-allowed"
```

Button label: `Complete My Order — $XX.XX` with a `<Lock>` icon.

**Trust badges row** below the button:
```tsx
<div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-secondary-400 font-medium">
  <span>🔒 SSL Encrypted</span>
  <span>·</span>
  <span>⚡ Powered by Stripe</span>
  <span>·</span>
  <span>✅ Safe Checkout</span>
</div>
```
