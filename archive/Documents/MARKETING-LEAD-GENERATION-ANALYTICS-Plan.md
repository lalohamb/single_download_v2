Phase 2 Implementation Plan
1. GA4 / Ecommerce Events
Approach: A single useAnalytics hook that wraps window.gtag. GA4 Measurement ID stored in seo_settings table (one new column), loaded the same way the Facebook Pixel ID is loaded — no hardcoding.

Files to create:

src/lib/analytics.ts — gtag() wrapper + typed event helpers (trackViewItem, trackAddToCart, trackBeginCheckout, trackPurchase, etc.)

src/components/GoogleAnalytics.tsx — loads the gtag.js script via next/script, fires page_view on route changes (mirrors the existing FacebookPixel.tsx pattern exactly)

Files to modify:

src/app/layout.tsx — fetch ga_measurement_id from seo_settings, render <GoogleAnalytics /> alongside <FacebookPixel />

src/app/product/[id]/ProductDetailClient.tsx — call trackViewItem on mount (alongside existing fbq ViewContent)

src/app/product/[id]/ProductDetailClient.tsx — call trackAddToCart in handleAddToCart (alongside existing fbq AddToCart)

src/app/checkout/page.tsx — call trackBeginCheckout when the form submits

src/app/checkout/success/page.tsx — call trackPurchase when order is confirmed (alongside existing fbq Purchase)

src/app/shop/ShopClient.tsx — call trackSearch when searchQuery is non-empty

supabase/migrations/ — one new migration adding ga_measurement_id text column to seo_settings

src/app/api/seo/route.ts — add ga_measurement_id to the SEO_ALLOWED_FIELDS set

src/app/admin/seo/page.tsx — add a GA4 Measurement ID input field

next.config.mjs — add https://www.googletagmanager.com to connect-src in CSP (it's already in script-src)

2. UTM + First/Last-Touch Attribution
Approach: A client-side AttributionTracker component (similar to AffiliateTracker) that reads URL params on every page load, persists first-touch to localStorage (never overwritten), updates last-touch on every visit, and exposes both to checkout via window.__attribution. The Stripe checkout edge function reads this and stores it on the order.

Files to create:

src/lib/attribution.ts — read/write first-touch and last-touch from localStorage; captures utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_page

src/components/AttributionTracker.tsx — mounts on every page, calls attribution.ts on load, sets window.__attribution

Files to modify:

src/components/StorefrontClientShell.tsx — render <AttributionTracker /> (same pattern as <AffiliateTracker />)

src/lib/supabase.ts (createStripeCheckout) — read window.__attribution and pass it in the request body

supabase/functions/stripe-checkout/index.ts — accept attribution object from body, store it in orders insert

supabase/migrations/ — one migration adding utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_page, first_touch (jsonb), last_touch (jsonb) columns to orders

3. Marketing Consent — Newsletter Forms
Problem: Both NewsletterSignup.tsx and NewsletterPopup.tsx submit email to MailerLite with no explicit consent checkbox. This is a CAN-SPAM / GDPR risk.

Fix for NewsletterSignup.tsx:

Add a consent boolean state

Add a checkbox: "Yes, I agree to receive marketing emails. Unsubscribe anytime."

Disable the submit button until consent === true

No other logic changes needed

Fix for NewsletterPopup.tsx:

Same: add consent checkbox above the submit button

Compact styling to fit the popup layout

These are the only two files that need changes for consent on newsletter forms.

4. Marketing Consent — Checkout MailerLite Auto-Add
Problem: In supabase/functions/stripe-webhook/index.ts, every customer who completes a purchase is silently added to MailerLite group 182701481182365511 regardless of whether they opted in. The group ID is also hardcoded.

Two changes needed:

Change A — Checkout opt-in checkbox (src/app/checkout/page.tsx):

Add marketingOptIn: false to form state

Add a checkbox below the email field: "Sign me up for new drops and exclusive offers"

Pass marketing_opt_in: form.marketingOptIn to createStripeCheckout

src/lib/supabase.ts — pass marketing_opt_in in the request body to the edge function

supabase/functions/stripe-checkout/index.ts — accept marketing_opt_in boolean, store it in orders insert and in Stripe session metadata as "marketing_opt_in": "true"/"false"

Change B — Conditional MailerLite sync (supabase/functions/stripe-webhook/index.ts):

Change the MailerLite block from unconditional to: if (mailerLiteKey && session.metadata?.email && session.metadata?.marketing_opt_in === "true")

Also replace the hardcoded group ID 182701481182365511 with a DB lookup: read settings.newsletter_group_id (this field already exists in the schema)

Migration needed: Add marketing_opt_in boolean default false column to orders table.

5. Search Console Confirmation
No code change needed. The infrastructure is already complete:

seo_settings.google_site_verification column exists

src/app/layout.tsx already injects the meta tag when the value is non-empty

The admin UI at /admin/seo already has the input field

Action required (not code): Log into Google Search Console → add https://bodyandsleeves.com → choose HTML tag method → copy the content value → paste into Admin → SEO → save → click Verify in Search Console → submit sitemap.

6. Secured Marketing API
Purpose: Allow the future central AI marketing agent to read analytics, leads, orders, and conversion data without direct database credentials.

Files to create:

src/app/api/marketing/route.ts — read-only API secured by a MARKETING_API_KEY env var (Bearer token, not admin session). Exposes:

GET ?resource=orders&since=ISO_DATE — order count, revenue, top products

GET ?resource=leads — newsletter subscriber count from MailerLite

GET ?resource=attribution — UTM breakdown from orders table

GET ?resource=products — active product list with price/status

All responses are aggregated/summarized — no PII returned

Files to modify:

.env.example — add MARKETING_API_KEY=<generate with openssl rand -hex 32>

next.config.mjs — no CSP change needed (server-only route)

Summary Table
#	What	Files Changed	New Files	Migration
1	GA4 events	layout.tsx, ProductDetailClient.tsx, checkout/page.tsx, success/page.tsx, ShopClient.tsx, api/seo/route.ts, admin/seo/page.tsx, next.config.mjs	lib/analytics.ts, components/GoogleAnalytics.tsx	Yes — ga_measurement_id on seo_settings
2	UTM attribution	StorefrontClientShell.tsx, lib/supabase.ts, stripe-checkout/index.ts	lib/attribution.ts, components/AttributionTracker.tsx	Yes — UTM columns on orders
3	Newsletter consent	NewsletterSignup.tsx, NewsletterPopup.tsx	None	None
4	Checkout consent + conditional MailerLite	checkout/page.tsx, lib/supabase.ts, stripe-checkout/index.ts, stripe-webhook/index.ts	None	Yes — marketing_opt_in on orders
5	Search Console	No code — admin action only	None	None
6	Marketing API	.env.example	api/marketing/route.ts	None
Recommended Implementation Order
Consent fixes first (3 + 4) — these are a legal/compliance risk, smallest change, no dependencies

UTM attribution (2) — needed before GA4 so orders carry source data from day one

GA4 events (1) — depends on attribution being in place so purchase events carry campaign data

Search Console (5) — admin action, do it the same day GA4 goes live

Marketing API (6) — last, after data is flowing into the DB

how would a admin manage for a new install.? Are these changes hardcoded?


Context
Good question. Let me check how the existing admin SEO panel and settings system work before answering.

2 files read
page.tsx
page.tsx
Now I have a complete picture of how the admin system works. Here's the direct answer:

Nothing in Phase 2 should be hardcoded. Here's exactly how each piece fits the existing admin pattern.
How the existing system works
Every configurable value follows the same pattern already established in the codebase:

A column is added to seo_settings or settings via a migration

The API route (/api/seo or a new /api/marketing) reads/writes that column

The admin page has an input field that calls that API on save

The frontend reads the value at runtime from the DB — never from env vars or source code

The Facebook Pixel ID is the perfect example: it's a column in seo_settings, editable at /admin/seo, and the component only loads if the value is non-empty. GA4 would work identically.

Per-feature admin management plan
GA4 Measurement ID

New column ga_measurement_id on seo_settings

Input field added to the existing /admin/seo page, in the same "Site Basics" card alongside the Facebook Pixel field

Leave blank = GA4 disabled. Paste G-XXXXXXXXXX = GA4 active. No deploy needed.

On a new install: field is empty, GA4 simply doesn't load

UTM / Attribution

New columns on orders (utm_source, utm_medium, etc.)

No admin UI needed — attribution is captured automatically from URL params

Admin can see attribution data in a future orders report view

On a new install: columns exist but are null until traffic arrives with UTM params

Newsletter consent checkbox

No admin setting needed — the checkbox is always shown

The consent text can optionally be made configurable via a settings column (newsletter_consent_text) if you want the store owner to customize the wording

On a new install: checkbox appears, form won't submit without it checked

Checkout marketing opt-in

A marketing_opt_in_label column in settings lets the admin customize the checkbox label (e.g. "Sign me up for exclusive drops")

Editable in /admin/settings under the existing "Store Information" or a new "Marketing" section

Default label works out of the box on a new install

The MailerLite sync in the Stripe webhook already reads settings.newsletter_group_id — that field already exists and is already editable in the admin

Marketing API key

MARKETING_API_KEY goes in .env.local / ecosystem config — it's a server secret, not a DB value

This is correct: it's a credential for an external system (the future AI agent), not a storefront setting

On a new install: generate with openssl rand -hex 32, add to .env.local. If absent, the /api/marketing route returns 401.

What a new install admin does — step by step
After running the migrations and deploying:

Go to /admin/seo → paste GA4 Measurement ID → Save

Go to /admin/seo → paste Facebook Pixel ID → Save (already exists)

Go to /admin/seo → paste Google Search Console verification code → Save (already exists)

Go to /admin/settings → confirm newsletter consent label text (or leave default)

Go to /admin/mailerlite → confirm the newsletter group ID is set in Settings → Newsletter Group

Add MARKETING_API_KEY to .env.local if using the marketing API

Zero hardcoded values. Zero redeploys needed to configure any of this. The pattern is identical to how Facebook Pixel, Resend API key, and the Google verification code are already managed today.

waht about database changes?


Context
Let me check the existing migration pattern and schema before answering.

4 files read
20261014000000_add_facebook_pixel.sql
20260916000000_add_email_events.sql
20260915000000_add_livemode_to_orders.sql
20261014000000_add_discount_fields.sql
Good. Now I have the full picture. Here's the complete database change plan for Phase 2.

Phase 2 Database Changes
There are exactly 3 migrations needed. Nothing else touches the DB.

Migration 1 — GA4 on seo_settings
File: supabase/migrations/20261016000000_add_ga4.sql

ALTER TABLE seo_settings
  ADD COLUMN IF NOT EXISTS ga_measurement_id text DEFAULT '';

Copy
sql
One line. Same pattern as the Facebook Pixel migration. The existing /api/seo route and /admin/seo page just need ga_measurement_id added to their field lists — no structural change to the table.

Migration 2 — UTM attribution + marketing opt-in on orders
File: supabase/migrations/20261016000001_add_attribution_to_orders.sql

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS marketing_opt_in  boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS utm_source        text,
  ADD COLUMN IF NOT EXISTS utm_medium        text,
  ADD COLUMN IF NOT EXISTS utm_campaign      text,
  ADD COLUMN IF NOT EXISTS utm_content       text,
  ADD COLUMN IF NOT EXISTS utm_term          text,
  ADD COLUMN IF NOT EXISTS referrer          text,
  ADD COLUMN IF NOT EXISTS landing_page      text,
  ADD COLUMN IF NOT EXISTS first_touch       jsonb,
  ADD COLUMN IF NOT EXISTS last_touch        jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_utm_source   ON orders(utm_source);
CREATE INDEX IF NOT EXISTS idx_orders_utm_campaign ON orders(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_orders_marketing_optin ON orders(marketing_opt_in);

Copy
sql
Why first_touch and last_touch are jsonb: They store the full attribution snapshot at the moment of that touch — source, medium, campaign, referrer, landing page, and timestamp — all in one field. This avoids needing 10 more columns and makes it easy to compare first vs last touch without joins.

Why indexes on utm_source and utm_campaign: The marketing API will query orders grouped by these columns. Without indexes those queries get slow as orders grow.

marketing_opt_in defaults to false: Existing orders are correctly treated as not opted in. New orders only get true if the customer checks the box at checkout.

Migration 3 — Consent label customization on settings
File: supabase/migrations/20261016000002_add_marketing_consent_label.sql

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS newsletter_consent_text text
    DEFAULT 'Yes, send me new drops and exclusive offers. Unsubscribe anytime.';

Copy
sql
This is optional but recommended. It lets the store owner customize the consent checkbox wording from /admin/settings without a code change. If you prefer to hardcode the consent text, skip this migration entirely.

What does NOT need a migration
Item	Reason
MARKETING_API_KEY	Server env var, not stored in DB
Attribution tracker component	Client-side only, reads URL params
GA4 script component	Reads ga_measurement_id already added above
Newsletter consent checkbox	UI change only, no new data stored
MailerLite conditional sync	Logic change in edge function, reads existing settings.newsletter_group_id which already exists
Existing columns already in place — no migration needed
These were confirmed in the schema audit and require no changes:

Column	Table	Used for
newsletter_group_id	settings	MailerLite group for opt-in sync
affiliate_code	orders	Already tracks affiliate attribution
facebook_pixel_id	seo_settings	Already exists from prior migration
google_site_verification	seo_settings	Already exists
discount_code, discount_amount	orders	Already exists
livemode	orders	Already exists
Migration execution order
20261016000000_add_ga4.sql
20261016000001_add_attribution_to_orders.sql
20261016000002_add_marketing_consent_label.sql   ← optional

Copy
Run via Supabase CLI:

supabase db push

Copy
bash
Or paste directly into the Supabase SQL Editor if not using the CLI. All three use ADD COLUMN IF NOT EXISTS so they are safe to run on an existing live database — they will not fail if re-run and will not touch existing data.