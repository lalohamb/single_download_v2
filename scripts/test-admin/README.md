# Admin Panel Test Suite
<!-- scripts/test-admin/README.md -->
<!-- Last updated: 2025-07-29 -->

---

## Overview

This suite validates every admin panel page end-to-end — from the write operation down to the database row and back through the `settings_public` view. It does not mock anything. Every test calls the same code path the browser uses, then uses the Supabase service role to read the DB directly and confirm the value actually landed.

The primary purpose is to catch the class of bug where a write returns `error: null` but nothing persists — caused by RLS policy mismatches, view permission issues, wrong table names, or stale column references.

---

## Environment

### Required Files

| File | Purpose | Contains |
|---|---|---|
| `.env.local` | Primary test env — **use this one** | Full `SUPABASE_SERVICE_ROLE_KEY`, all Supabase keys |
| `.env.prod` | Production reference — **do not use for tests** | Keys are truncated (ends with `>`) — will fail auth |

### Required Variables

These must be present in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← must be the full key, not truncated
```

### Why Two Clients

The test suite uses two Supabase clients with different roles:

**Anon client** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Used only to sign in as admin and get a JWT access token
- Same key the browser uses

**Service role client** (`SUPABASE_SERVICE_ROLE_KEY`)
- Used for post-write verification reads only
- Bypasses RLS entirely — confirms what actually landed in the DB regardless of policies
- Never used for writes in tests — writes always go through the same path as the browser

This separation is intentional. If a write goes through the browser path and the service role read confirms it landed, the full stack is verified. If the service role read shows `null` after a successful write, the RLS or view permissions are broken.

---

## Prerequisites

1. Local dev server must be running on `http://localhost:3007`
   ```bash
   npm run dev
   ```

2. `.env.local` must have all three Supabase keys (full, not truncated)

3. You need a valid admin email and password for the Supabase auth sign-in

---

## Running the Suite

### Full suite

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpassword \
  node --env-file=.env.local scripts/test-admin/run-all.js
```

### Single test

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpassword \
  node --env-file=.env.local --input-type=module \
  --eval "import { signInAdmin } from './scripts/test-admin/lib/client.js'; \
          import { run } from './scripts/test-admin/tests/13-settings-writes.js'; \
          await signInAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD); \
          await run();"
```

### Exit codes

- `0` — all tests passed
- `1` — one or more tests failed

---

## Test Result Symbols

| Symbol | Meaning |
|---|---|
| ✅ PASS | Assertion passed |
| ❌ FAIL | Assertion failed — reason shown on next line |
| ⏭ SKIP | Test intentionally skipped — reason shown |

---

## Architecture

```
scripts/test-admin/
  run-all.js              ← Entry point. Signs in, runs all tests in order, prints summary.
  README.md               ← This file.
  lib/
    client.js             ← Supabase service role client, admin sign-in, api() fetch helper.
    assert.js             ← pass(), fail(), skip(), check(), summary() reporter.
  tests/
    01-dashboard.js
    02-orders.js
    03-products.js
    04-categories.js
    05-customers.js
    06-affiliates.js
    07-email.js
    08-mailerlite.js
    09-media.js
    10-policies.js
    11-seo.js
    12-shipping.js
    13-settings-writes.js
    14-danger-auth.js
```

---

## Test Descriptions

---

### 01 — Dashboard
**File:** `tests/01-dashboard.js`
**Page:** `/admin/dashboard`
**What the page does:** Reads orders, products, customer counts, and revenue stats. Has a single write: the `orders_paused` toggle button which calls `supabase.from("settings").update({ orders_paused })`.

**What the test does:**
1. Reads the current `orders_paused` value from `settings`
2. Writes the toggled value via service role (same table the dashboard button writes to)
3. Reads back from `settings` — confirms the value landed
4. Reads back from `settings_public` view — confirms the view reflects the change
5. Restores the original value

**Why it matters:** Confirms the `settings` table write path and `settings_public` view are in sync for a simple boolean column.

---

### 02 — Orders
**File:** `tests/02-orders.js`
**Page:** `/admin/orders`
**What the page does:** Lists all orders. Allows status updates (`paid`, `fulfilled`, `shipped`, `cancelled`) and order deletion. Uses `supabase.from("orders").update({ status })`.

**What the test does:**
1. Finds the oldest test-mode order (`livemode = false`)
2. Updates its status to the opposite value
3. Reads back from `orders` — confirms the status landed
4. Restores the original status

**Skipped if:** No test-mode orders exist. Run a test checkout first.

**Why it matters:** Confirms the `orders` table RLS UPDATE policy allows admin writes.

---

### 03 — Products
**File:** `tests/03-products.js`
**Page:** `/admin/products`
**What the page does:** Lists all products. Allows toggling `featured`, `status`, bulk patches, and deletion. Uses `supabase.from("products").update(patch)`.

**What the test does:**
1. Finds the first active product
2. Toggles its `featured` flag
3. Reads back from `products` — confirms the value landed
4. Restores the original value

**Skipped if:** No active products exist.

**Why it matters:** Confirms the `products` table RLS UPDATE policy allows admin writes.

---

### 04 — Categories
**File:** `tests/04-categories.js`
**Page:** `/admin/categories`
**What the page does:** Full CRUD on the `categories` table — insert new categories, update name/slug/image/gradient, delete. Uses `supabase.from("categories").insert/update/delete`.

**What the test does:**
1. Inserts a test category with a unique slug (`__test-{timestamp}`)
2. Reads back — confirms it exists
3. Updates the name
4. Reads back — confirms the name changed
5. Deletes the test category
6. Reads back — confirms it is gone

**Why it matters:** Full insert/update/delete cycle. Confirms all three RLS operations work on `categories`.

---

### 05 — Customers
**File:** `tests/05-customers.js`
**Page:** `/admin/customers`
**What the page does:** Read-only list of customers with order counts and revenue. Calls `GET /api/admin/customers` which aggregates `orders` and `customer_profiles`.

**What the test does:**
1. Calls `GET /api/admin/customers` with the admin JWT
2. Confirms the response is HTTP 200
3. Confirms the response is an array
4. If customers exist, confirms each record has `email`, `order_count`, and `total_spent` fields

**Why it matters:** Confirms the admin API route is reachable and returns the expected shape. No writes on this page.

---

### 06 — Affiliates
**File:** `tests/06-affiliates.js`
**Page:** `/admin/affiliates`
**What the page does:** Lists affiliates and conversions. Has one write: the `affiliate_program_enabled` toggle which calls `supabase.from("settings").update({ affiliate_program_enabled })`.

**What the test does:**
1. Reads current `affiliate_program_enabled` from `settings`
2. Writes the toggled value
3. Reads back from `settings` — confirms the value landed
4. Reads back from `settings_public` view — confirms the view reflects the change
5. Restores the original value

**Why it matters:** Same write path as the dashboard toggle but for a different column. Confirms `settings_public` view exposes `affiliate_program_enabled`.

---

### 07 — Email
**File:** `tests/07-email.js`
**Page:** `/admin/email`
**What the page does:** Shows email event log, Resend domain status, and allows updating `resend_api_key`, `email_from`, `email_support` via `POST /api/admin/email-settings`.

**What the test does:**
1. Calls `GET /api/admin/email-settings` with the admin JWT
2. Confirms HTTP 200
3. Confirms response has `resend_api_key_saved` and `email_from` fields

**Skipped:** Write test — would overwrite the live Resend API key.

**Why it matters:** Confirms the email settings API route is reachable and protected by admin auth.

---

### 08 — MailerLite
**File:** `tests/08-mailerlite.js`
**Page:** `/admin/mailerlite`
**What the page does:** Manages MailerLite subscriber groups, automations, and subscriber counts. All operations go through `POST /api/mailerlite`.

**What the test does:**
1. Calls `GET /api/mailerlite?action=groups` with the admin JWT
2. Confirms HTTP 200 (or skips if MailerLite API key not configured)
3. Confirms the response is an array

**Why it matters:** Confirms the MailerLite proxy route is reachable and the API key is configured.

---

### 09 — Media
**File:** `tests/09-media.js`
**Page:** `/admin/media`
**What the page does:** Manages the `store-images` Supabase storage bucket — upload, list, rename, delete. Uses `supabase.storage.from("store-images")`.

**What the test does:**
1. Uploads a minimal 1×1 transparent PNG to `uploads/__test-{timestamp}.png`
2. Lists the `uploads` folder — confirms the file appears
3. Gets the public URL — confirms it is generated
4. Deletes the test file
5. Lists again — confirms the file is gone

**Why it matters:** Full storage upload/list/delete cycle. Confirms the `store-images` bucket exists and storage permissions are correct.

---

### 10 — Policies
**File:** `tests/10-policies.js`
**Page:** `/admin/policies`
**What the page does:** Edits the three policy pages (privacy, terms, refund) stored in the `policies` table. Uses `supabase.from("policies").upsert`.

**What the test does:**
1. Reads the current `privacy` policy content
2. Upserts test HTML content
3. Reads back from `policies` — confirms the content landed
4. Restores the original content (or deletes the row if it did not exist before)

**Why it matters:** Confirms the `policies` table upsert works and RLS allows admin writes.

---

### 11 — SEO
**File:** `tests/11-seo.js`
**Page:** `/admin/seo`
**What the page does:** Manages SEO settings stored in the `seo_settings` table. All reads and writes go through `GET /api/seo` and `POST /api/seo` (service role writes).

**What the test does:**
1. Calls `GET /api/seo` — confirms HTTP 200 and response has `site_url`
2. Calls `POST /api/seo` with a test `meta_title_suffix` value
3. Reads `seo_settings` directly via service role — confirms the value landed in the DB
4. Restores the original value via `POST /api/seo`

**Why it matters:** SEO writes go through an API route that uses the service role — this confirms the route is protected by admin auth and the write actually lands.

---

### 12 — Shipping
**File:** `tests/12-shipping.js`
**Page:** `/admin/shipping`
**What the page does:** Updates `default_shipping_cost`, `shipping_free_threshold`, and product badge text/active flags in the `settings` table. Uses `supabase.from("settings").update`.

**What the test does:**
1. Reads current `default_shipping_cost` and `shipping_free_threshold`
2. Writes test values (`9.99` and `100`)
3. Reads back from `settings` — confirms both values landed
4. Reads back from `settings_public` view — confirms the view reflects both values
5. Restores original values

**Why it matters:** Confirms the `settings` table write path and `settings_public` view are in sync for numeric columns.

---

### 13 — Settings Writes (All 20 Sections)
**File:** `tests/13-settings-writes.js`
**Page:** `/admin/settings/[section]` — all 20 sections
**What the page does:** Every settings section writes to the `settings` table via `useSettings.save()` which calls `supabase.from("settings").update`. The `settings_public` view must reflect every written value for the storefront to see it.

**What the test does for each field:**
1. Reads the current value from `settings` (service role)
2. Writes a known test value to `settings` (service role — same table `useSettings.save()` writes to)
3. Reads back from `settings` — confirms the value landed in the table
4. Reads back from `settings_public` view — **confirms the view exposes the value**
5. Restores the original value

**Fields tested:**

| Field | Section |
|---|---|
| `store_name` | Store Information / Branding |
| `tagline` | Store Information / Branding |
| `logo_url` | Branding |
| `hero_title` | Homepage Hero |
| `hero_image_url` | Homepage Hero |
| `hero_gradient_opacity` | Homepage Hero |
| `our_why_label` | Our Why |
| `our_why_image_url` | Our Why |
| `story_image_url` | Wear Your Story |
| `footer_text` | Footer |
| `footer_bottom_message` | Footer |
| `announcement` | Announcements |
| `announcement_active` | Announcements |
| `social_links` | Social Links |
| `about_settings` | About Hero / Story / Mission / Culture |
| `affirmations_settings` | Homepage Hero — Affirmations Marquee |
| `new_arrivals_settings` | New Arrivals |
| `brand_values_settings` | Brand Values |
| `feature_strip_settings` | Feature Strip |
| `site_menu_settings` | Menu Bar |
| `popup_settings` | Newsletter Popup |
| `testimonials` | Customer Love |

**The `about_settings` test is the most important.** It writes `{ heroImageUrl: "...", heroTitle: "TEST TITLE" }` to the `about_settings` jsonb column and confirms:
- The value appears in `settings` (write landed)
- The value appears in `settings_public` (view exposes it)

If `settings_public` returns `null` for `about_settings` after a successful write, the view has a permissions problem — specifically the `REVOKE/GRANT` sequence did not run correctly and the view is still accepting writes directly instead of being read-only.

**Why it matters:** This is the core regression test for the entire admin settings system. Any RLS policy change, view recreation, or migration that touches the `settings` table should be followed by running this test.

---

### 14 — Danger Zone Auth
**File:** `tests/14-danger-auth.js`
**Page:** `/admin/danger`
**What the page does:** Provides a destructive reset operation via `POST /api/admin/reset`. Requires admin auth.

**What the test does:**
1. Calls `POST /api/admin/reset` with no Authorization header
2. Confirms the response is HTTP 401

**Never executes the actual reset.**

**Why it matters:** Confirms the most destructive endpoint in the system is protected and returns 401 to unauthenticated callers.

---

## Safety Rules

1. **Tests never create permanent data.** Every insert is cleaned up. Every update is restored to its original value.
2. **Tests never send real emails.** Email write tests are skipped.
3. **Tests never touch Stripe keys.** Stripe is excluded from this suite.
4. **Tests never execute the danger zone reset.** Only the auth check runs.
5. **Tests use the oldest test-mode order** for order status tests — never a live order.
6. **Always use `--env-file=.env.local`** — `.env.prod` has truncated keys that will fail.

---

## Interpreting Results

### All PASS
The full write path from admin UI → `settings` table → `settings_public` view is working correctly.

### FAIL on `settings_public` view checks (but PASS on table checks)
The view is not exposing the column. Either:
- The column was added after the view was created and the view was not updated
- The `REVOKE/GRANT` sequence left incorrect permissions on the view
- Run the view recreation SQL from `APPLY-NOW-pending-migrations-consolidated.sql`

### FAIL on table checks
The write is being blocked by RLS. Either:
- The `admin_update_settings` policy is using `admins.id` instead of `admins.auth_user_id`
- The migration `20261020000000_fix_admins_pk.sql` was not fully applied
- Run the full consolidated migration script

### SKIP on orders/products tests
No test-mode data exists. Run a test checkout at `http://localhost:3007` in Stripe test mode first.
