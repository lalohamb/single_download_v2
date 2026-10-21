# PHASE 1 — MARKETING, LEAD GENERATION & ANALYTICS INFRASTRUCTURE AUDIT

**Site:** Body & Sleeves — bodyandsleeves.com
**Audit Date:** 2025
**Auditor:** Amazon Q (AI Assistant)
**Scope:** Read-only inspection of all source files, migrations, edge functions, and documentation.

---

## Executive Summary

Body & Sleeves is a fully operational Next.js 15 print-on-demand storefront built on Supabase, Stripe, and Printify. The application has a meaningful but incomplete marketing infrastructure. Facebook Pixel (browser-side) is implemented with 4 events. Meta Conversions API (server-side) is partially wired in the Stripe webhook. MailerLite newsletter capture exists in two locations. SEO infrastructure is solid for a POD store. Google Analytics / GA4 is entirely absent. UTM/attribution tracking does not exist beyond an affiliate referral code. No TikTok, Pinterest, Google Ads, or Microsoft Ads integrations exist. The site is well-positioned for a Phase 2 marketing build-out.

---

## Current Technology Stack

| Item | Value |
|---|---|
| Framework | Next.js 15.5.25 |
| Router | App Router |
| React | 19 |
| TypeScript | Yes (strict) |
| Package Manager | npm (package-lock.json present) |
| Deployment | VPS (DigitalOcean Droplet) + PM2 + Nginx + standalone Next.js output |
| Database | Supabase (PostgreSQL) |
| Auth Provider | Supabase Auth (OTP magic link for customers; admin table for admins) |
| Ecommerce/Cart | Custom React Context (localStorage-persisted) |
| Checkout/Payment | Stripe Checkout (via Supabase Edge Function) |
| Fulfillment | Printify (via Supabase Edge Functions) |
| Email — Transactional | Resend |
| Email — Marketing | MailerLite |
| CSS | Tailwind CSS 3 |
| Testing | Playwright (E2E) |
| CDN/Images | Next.js Image Optimization + Printify CDN + Supabase Storage |


---

## Existing Marketing Infrastructure

| Capability | Status | Location |
|---|---|---|
| Facebook Pixel (browser) | IMPLEMENTED | `src/components/FacebookPixel.tsx` |
| Meta Conversions API (server) | PARTIAL | `supabase/functions/stripe-webhook/index.ts` |
| MailerLite newsletter signup | IMPLEMENTED | `src/components/NewsletterSignup.tsx`, `NewsletterPopup.tsx` |
| MailerLite post-purchase sync | IMPLEMENTED | `supabase/functions/stripe-webhook/index.ts` |
| Affiliate tracking | IMPLEMENTED | `src/components/AffiliateTracker.tsx` + DB tables |
| Google Analytics / GA4 | NOT IMPLEMENTED | — |
| Google Tag Manager | NOT IMPLEMENTED | — |
| TikTok Pixel | NOT IMPLEMENTED | — |
| Pinterest Tag | NOT IMPLEMENTED | — |
| Google Ads | NOT IMPLEMENTED | — |
| UTM parameter capture | NOT IMPLEMENTED | — |
| Abandoned cart email | NOT IMPLEMENTED | — |
| Post-purchase email sequence | PARTIAL (single confirmation only) | Stripe webhook |

---

## Analytics Status

### Google Analytics / GA4

NOT IMPLEMENTED. No GA4 measurement ID, no gtag script, no Google Tag Manager container found anywhere in the codebase. The CSP in `next.config.mjs` does not include `www.googletagmanager.com` in `connect-src` (only in `script-src`), suggesting GTM was considered but never fully wired.

### Standard Ecommerce Event Coverage

| Event | Status | Implementation |
|---|---|---|
| page_view | NOT IMPLEMENTED | No GA4 |
| view_item | NOT IMPLEMENTED | No GA4 |
| view_item_list | NOT IMPLEMENTED | No GA4 |
| select_item | NOT IMPLEMENTED | No GA4 |
| add_to_cart | NOT IMPLEMENTED | No GA4 |
| remove_from_cart | NOT IMPLEMENTED | No GA4 |
| view_cart | NOT IMPLEMENTED | No GA4 |
| begin_checkout | NOT IMPLEMENTED | No GA4 |
| add_shipping_info | NOT IMPLEMENTED | No GA4 |
| add_payment_info | NOT IMPLEMENTED | No GA4 |
| purchase | NOT IMPLEMENTED | No GA4 |
| search | NOT IMPLEMENTED | No GA4 |
| sign_up | NOT IMPLEMENTED | No GA4 |
| generate_lead | NOT IMPLEMENTED | No GA4 |

Note: The `public/ga.png` file exists in the public directory — this appears to be a placeholder or documentation image, not an active tracking pixel.


---

## SEO Status

### Implementation Quality: GOOD

SEO is managed through a `seo_settings` database table with a full admin UI at `/admin/seo`. All settings are dynamic — no hardcoded values in source files.

### Feature Coverage

| Feature | Status | Source |
|---|---|---|
| Metadata API (Next.js) | IMPLEMENTED | All page files use `generateMetadata()` |
| Page titles | DYNAMIC | From `settings.store_name` + `seo_settings.meta_title_suffix` |
| Meta descriptions | PARTIAL — static on most pages, dynamic on product pages | `page.tsx` files |
| Canonical URLs | DYNAMIC (toggle-controlled) | `seo_settings.canonical_enabled` |
| Open Graph metadata | IMPLEMENTED | Root layout + product pages |
| Twitter/X metadata | IMPLEMENTED | Root layout, from `seo_settings.twitter_handle` |
| Product metadata | DYNAMIC | `src/app/product/[id]/page.tsx` |
| Category metadata | STATIC | Shop page has static description only |
| Collection metadata | NOT IMPLEMENTED | No collection pages exist |
| Article/Blog metadata | NOT IMPLEMENTED | No blog exists |
| Structured Data / JSON-LD | IMPLEMENTED (toggle-controlled) | Product pages only |
| Product schema | IMPLEMENTED | `src/app/product/[id]/page.tsx` |
| Organization schema | NOT IMPLEMENTED | — |
| WebSite schema | NOT IMPLEMENTED | — |
| BreadcrumbList schema | NOT IMPLEMENTED | — |
| Article schema | NOT IMPLEMENTED | No blog |
| FAQ schema | NOT IMPLEMENTED | — |
| sitemap.xml | DYNAMIC | `src/app/sitemap.ts` — revalidates hourly |
| robots.txt | DYNAMIC | `src/app/robots.ts` — revalidates hourly |
| Favicon | DYNAMIC | `/api/favicon` route, from `settings.favicon_url` |

### SEO Gaps

- No Organization or WebSite JSON-LD schema on homepage
- No BreadcrumbList schema on product or shop pages
- Shop page, About page, and policy pages have static meta descriptions
- No blog/article content for organic acquisition
- No collection-level SEO pages (only category filter via query string `/shop?category=hoodies`)
- Category pages are not separate routes — they are client-side filtered views of `/shop`, meaning each category has no unique URL with its own metadata

---

## Search Console Status

### Verification

PARTIAL. The `seo_settings` table has a `google_site_verification` column. The root layout (`src/app/layout.tsx`) reads this value and injects the meta tag when non-empty. The field exists in the admin UI at `/admin/seo`. Whether the actual verification code has been entered for bodyandsleeves.com is a runtime/database question, not determinable from source code alone.

### Supporting Infrastructure

| Feature | Status |
|---|---|
| sitemap.xml | IMPLEMENTED — dynamic, product-aware, toggle-controlled |
| robots.txt | IMPLEMENTED — dynamic, blocks /admin/, /checkout/, /api/ |
| Canonical URLs | IMPLEMENTED — toggle-controlled per product page |
| Google verification meta tag | IMPLEMENTED (infrastructure) — value must be set in admin |
| DNS verification | NOT APPLICABLE (HTML tag method is implemented) |
| GTM-based verification | NOT APPLICABLE (no GTM) |
| GA-based verification | NOT APPLICABLE (no GA) |


---

## Lead Capture Status

### 1. Newsletter Popup

- **Page/Component:** All pages — `src/components/NewsletterPopup.tsx` (rendered in `StorefrontClientShell`)
- **Data Collected:** Email address only
- **Destination:** MailerLite via `/api/mailerlite` (action: `add_subscriber`)
- **API/Provider:** MailerLite v3 API
- **Database Table:** None — goes directly to MailerLite
- **Double-Opt-In:** NOT IDENTIFIABLE from code — depends on MailerLite group settings
- **Marketing Consent:** NOT EXPLICIT — no checkbox, no consent language shown
- **Dismiss Behavior:** localStorage key with configurable TTL (default 7 days); key changes when popup content changes
- **Error Handling:** Error message displayed inline
- **Success Handling:** "You're in!" confirmation, auto-dismiss after 2.5 seconds

### 2. Newsletter Signup Section (Footer + Homepage Section)

- **Page/Component:** `src/components/NewsletterSignup.tsx` — appears in footer and as standalone section
- **Data Collected:** Email address only
- **Destination:** MailerLite via `/api/mailerlite`
- **API/Provider:** MailerLite v3 API
- **Database Table:** None
- **Double-Opt-In:** NOT IDENTIFIABLE from code
- **Marketing Consent:** NOT EXPLICIT — no checkbox
- **Error Handling:** Inline error message
- **Success Handling:** "You're in! Welcome to the culture." confirmation state

### 3. Customer Account Registration

- **Page/Component:** `src/app/account/signup/page.tsx`
- **Data Collected:** Email (OTP magic link — no password)
- **Destination:** Supabase Auth + `customer_profiles` table
- **API/Provider:** Supabase Auth
- **Database Table:** `customer_profiles` (id, email, newsletter_opt_in, full_name, phone, address, preferences)
- **Double-Opt-In:** Supabase OTP email confirmation (implicit)
- **Marketing Consent:** `newsletter_opt_in` boolean field exists in schema — UI implementation not confirmed without reading signup component
- **Error Handling:** Supabase auth errors
- **Success Handling:** Redirect to account dashboard

### 4. Checkout Email Capture

- **Page/Component:** `src/app/checkout/page.tsx`
- **Data Collected:** Email, first name, last name, shipping address
- **Destination:** Stripe session metadata → Supabase `orders` table → MailerLite (post-purchase sync in webhook)
- **API/Provider:** Stripe + Supabase + MailerLite
- **Database Table:** `orders` (email, shipping_name, shipping_address)
- **Double-Opt-In:** NOT APPLICABLE — transactional
- **Marketing Consent:** NOT EXPLICIT — no opt-in checkbox at checkout; customer is added to MailerLite automatically on purchase
- **Error Handling:** Stripe checkout errors displayed inline
- **Success Handling:** Redirect to `/checkout/success?session_id=...`

### 5. Affiliate Program Signup

- **Page/Component:** `src/app/affiliates/` (signup form)
- **Data Collected:** Name, email, code, platform URL, follower count, payout method/handle
- **Destination:** `affiliates` table (status: pending, requires admin approval)
- **API/Provider:** Supabase
- **Database Table:** `affiliates`
- **Double-Opt-In:** NOT APPLICABLE — admin approval workflow
- **Marketing Consent:** NOT APPLICABLE
- **Error Handling:** API error responses
- **Success Handling:** Pending status; approval email sent via Resend when admin approves


---

## Email Marketing Status

### Providers

| Provider | Status | Purpose |
|---|---|---|
| Resend | IMPLEMENTED | Transactional email (order confirmation, affiliate notifications, payout notifications) |
| MailerLite | IMPLEMENTED | Marketing email (newsletter, campaigns, automations) |
| Mailchimp | NOT IMPLEMENTED | — |
| Klaviyo | NOT IMPLEMENTED | — |
| Brevo | NOT IMPLEMENTED | — |
| ConvertKit | NOT IMPLEMENTED | — |
| SendGrid | NOT IMPLEMENTED | — |

### Email Capability Coverage

| Capability | Status | Notes |
|---|---|---|
| Newsletter subscription | IMPLEMENTED | Popup + footer + section forms → MailerLite |
| Welcome email | NOT IMPLEMENTED | No automation confirmed in code |
| Lead magnet | NOT IMPLEMENTED | — |
| First-purchase incentive | NOT IMPLEMENTED | — |
| Abandoned cart email | NOT IMPLEMENTED | Cart is localStorage only; no server-side cart state |
| Post-purchase email | PARTIAL | Single order confirmation via Resend only |
| Product recommendation email | NOT IMPLEMENTED | — |
| Customer re-engagement | NOT IMPLEMENTED | — |
| Transactional email | IMPLEMENTED | Order confirmation via Resend (stripe-webhook) |
| Marketing segmentation | PARTIAL | MailerLite groups exist; `newsletter_group_id` in settings; no automated segmentation by purchase behavior |

### Resend Integration Details

- API key stored in `settings.resend_api_key` (DB) or `RESEND_API_KEY` env var (DB takes priority)
- Webhook receiver at `/api/resend/webhook` — stores email events in `email_events` table
- Admin can send one-off emails via `/api/resend` (POST, admin-only)
- Order confirmation email sent from Stripe webhook edge function with full item list and images

### MailerLite Integration Details

- Full admin UI at `/admin/mailerlite` — subscribers, groups, campaigns, automations, forms
- API route `/api/mailerlite` supports: add/update/delete subscribers, create/schedule/delete campaigns, toggle automations, manage groups
- Post-purchase subscriber sync in Stripe webhook (hardcoded group ID `182701481182365511` — should be made configurable)
- `newsletter_group_id` in settings table for configurable group assignment from signup forms

---

## Attribution Status

### UTM Parameters

NOT IMPLEMENTED. No code anywhere captures, stores, or persists UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`).

### Referrer

NOT IMPLEMENTED as a marketing attribution mechanism. The affiliate tracker captures `document.referrer` for click logging only (`affiliate_clicks` table), not for general attribution.

### Affiliate Code Attribution

IMPLEMENTED. The affiliate `?ref=CODE` parameter is:
1. Captured by `AffiliateTracker` component on any page load
2. Stored in `localStorage` with 30-day TTL (`affiliate_ref` key)
3. Passed to Stripe checkout as `affiliate_code` in session metadata
4. Stored on the `orders` table (`affiliate_code` column)
5. Used in Stripe webhook to create `affiliate_conversions` record

### Attribution Survival Through Funnel

| Stage | Attribution Survives? |
|---|---|
| Landing page → browsing | YES (localStorage) |
| Browsing → cart | YES (localStorage) |
| Cart → checkout form | YES (window.__affiliateCode) |
| Checkout → Stripe session | YES (session metadata) |
| Stripe session → order | YES (orders.affiliate_code) |
| Order → conversion record | YES (affiliate_conversions) |

### What Does NOT Exist

- First-touch source tracking
- Last-touch source tracking
- UTM persistence across sessions
- Landing page capture
- Session identifiers linked to orders
- Customer lifetime attribution
- Multi-touch attribution

