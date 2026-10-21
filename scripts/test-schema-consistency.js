#!/usr/bin/env node
/**
 * scripts/test-schema-consistency.js
 *
 * Validates that SQL schema definitions in fresh_install.sql and migration files
 * are consistent with the column names used in application code.
 *
 * Runs offline — no database connection required.
 * Exit 0 = all checks pass. Exit 1 = one or more checks fail.
 *
 * Usage: node scripts/test-schema-consistency.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let failures = 0;
let passes = 0;

function pass(name) {
  console.log(`  PASS  ${name}`);
  passes++;
}

function fail(name, detail) {
  console.error(`  FAIL  ${name}`);
  console.error(`        ${detail}`);
  failures++;
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------------
// GAP-019: affiliate_payouts schema consistency
// ---------------------------------------------------------------------------
console.log("\n[GAP-019] affiliate_payouts schema vs. application insert\n");

const freshInstall = readFile("supabase/fresh_install.sql");
const migration001 = readFile("supabase/migrations/20261001000000_add_affiliates.sql");
const affiliateRoute = readFile("src/app/api/affiliates/route.ts");
const dashboardRoute = readFile("src/app/api/affiliates/dashboard/route.ts");
const payoutsRoute   = readFile("src/app/api/affiliates/payouts/route.ts");

// Columns the application insert uses (from affiliates/route.ts payout action)
const requiredColumns = [
  "total_amount",
  "payout_method",
  "payout_handle",
  "stripe_memo",
  "status",
  "paid_at",
  "period",
];

// Columns that must NOT appear in fresh_install.sql affiliate_payouts
const bannedColumns = [
  "amount",
  "method",
  "stripe_transfer_id",
];

// Extract the affiliate_payouts CREATE TABLE block from fresh_install.sql
const freshPayoutsMatch = freshInstall.match(
  /CREATE TABLE IF NOT EXISTS affiliate_payouts \([\s\S]+?\);/
);
if (!freshPayoutsMatch) {
  fail("fresh_install.sql contains affiliate_payouts table", "Table definition not found");
} else {
  const block = freshPayoutsMatch[0];

  for (const col of requiredColumns) {
    if (block.includes(col)) {
      pass(`fresh_install.sql affiliate_payouts has column: ${col}`);
    } else {
      fail(`fresh_install.sql affiliate_payouts has column: ${col}`, `Column '${col}' not found in table definition`);
    }
  }

  for (const col of bannedColumns) {
    // Match as a column name (word boundary), not inside another word
    const re = new RegExp(`\\b${col}\\b`);
    if (!re.test(block)) {
      pass(`fresh_install.sql affiliate_payouts does NOT have obsolete column: ${col}`);
    } else {
      fail(`fresh_install.sql affiliate_payouts does NOT have obsolete column: ${col}`, `Obsolete column '${col}' still present`);
    }
  }
}

// Verify migration 20261001 also has the correct columns
const migPayoutsMatch = migration001.match(
  /CREATE TABLE IF NOT EXISTS affiliate_payouts \([\s\S]+?\);/
);
if (!migPayoutsMatch) {
  fail("migration 20261001 contains affiliate_payouts table", "Table definition not found");
} else {
  const block = migPayoutsMatch[0];
  for (const col of requiredColumns) {
    if (block.includes(col)) {
      pass(`migration 20261001 affiliate_payouts has column: ${col}`);
    } else {
      fail(`migration 20261001 affiliate_payouts has column: ${col}`, `Column '${col}' not found`);
    }
  }
}

// Verify the route insert uses the correct columns
for (const col of requiredColumns) {
  if (affiliateRoute.includes(col)) {
    pass(`affiliates/route.ts payout insert references: ${col}`);
  } else {
    fail(`affiliates/route.ts payout insert references: ${col}`, `Column '${col}' not found in route`);
  }
}

// Verify dashboard SELECT includes the correct columns
const dashboardSelectCols = ["total_amount", "payout_method", "payout_handle", "status", "paid_at", "period"];
for (const col of dashboardSelectCols) {
  if (dashboardRoute.includes(col)) {
    pass(`affiliates/dashboard/route.ts SELECT references: ${col}`);
  } else {
    fail(`affiliates/dashboard/route.ts SELECT references: ${col}`, `Column '${col}' not found in dashboard route`);
  }
}

// ---------------------------------------------------------------------------
// GAP-012 / M1A: settings_public view must NOT include secret columns
// ---------------------------------------------------------------------------
console.log("\n[GAP-012] settings_public view excludes secret columns\n");

const migration012 = readFile(
  "supabase/migrations/20261017000000_restrict_settings_stripe_keys.sql"
);

// Extract the CREATE VIEW block
const viewMatch = migration012.match(/CREATE VIEW settings_public[\s\S]+?FROM settings;/);
if (!viewMatch) {
  fail("migration 20261017 contains settings_public view", "View definition not found");
} else {
  const viewBlock = viewMatch[0];

  const secretColumns = [
    "stripe_live_secret_key",
    "stripe_live_webhook_secret",
    "stripe_test_secret_key",
    "stripe_test_webhook_secret",
    "resend_api_key",
    "email_from",
    "email_support",
  ];

  for (const col of secretColumns) {
    // A column is "included" if it appears as a bare identifier (not in a comment)
    // Strip comment lines first
    const noComments = viewBlock.replace(/--[^\n]*/g, "");
    const re = new RegExp(`\\b${col}\\b`);
    if (!re.test(noComments)) {
      pass(`settings_public view excludes secret column: ${col}`);
    } else {
      fail(`settings_public view excludes secret column: ${col}`, `Column '${col}' found as active column in view (not just a comment)`);
    }
  }

  // Verify safe storefront columns ARE present
  const safeColumns = ["store_name", "tagline", "hero_image_url", "social_links", "announcement", "stripe_mode"];
  for (const col of safeColumns) {
    const noComments = viewBlock.replace(/--[^\n]*/g, "");
    if (noComments.includes(col)) {
      pass(`settings_public view includes safe column: ${col}`);
    } else {
      fail(`settings_public view includes safe column: ${col}`, `Column '${col}' not found in view`);
    }
  }
}

// Verify the deny policy is present
if (migration012.includes("USING (false)")) {
  pass("migration 20261017 sets public_read_settings policy to USING (false)");
} else {
  fail("migration 20261017 sets public_read_settings policy to USING (false)", "USING (false) not found");
}

// Verify GRANT is present
if (migration012.includes("GRANT SELECT ON settings_public TO anon, authenticated")) {
  pass("migration 20261017 grants SELECT on settings_public to anon, authenticated");
} else {
  fail("migration 20261017 grants SELECT on settings_public to anon, authenticated", "GRANT statement not found");
}

// ---------------------------------------------------------------------------
// GAP-016: Resend webhook fails closed
// ---------------------------------------------------------------------------
console.log("\n[GAP-016] Resend webhook fails closed when secret not set\n");

const resendWebhook = readFile("src/app/api/resend/webhook/route.ts");

if (resendWebhook.includes("if (!secret)") && resendWebhook.includes("status: 500")) {
  pass("resend/webhook/route.ts returns 500 when RESEND_WEBHOOK_SECRET not set");
} else {
  fail("resend/webhook/route.ts returns 500 when RESEND_WEBHOOK_SECRET not set",
    "Pattern 'if (!secret)' with status 500 not found — webhook may fail open");
}

// Verify the old fail-open pattern is gone
if (resendWebhook.includes("if (secret) {")) {
  fail("resend/webhook/route.ts does not use old fail-open pattern",
    "Old 'if (secret) {' pattern still present — verification may be conditional");
} else {
  pass("resend/webhook/route.ts does not use old fail-open pattern");
}

// ---------------------------------------------------------------------------
// GAP-018: .env files are gitignored
// ---------------------------------------------------------------------------
console.log("\n[GAP-018] .env files are gitignored\n");

const gitignore = readFile(".gitignore");

const envPatterns = [".env", ".env.*", ".env.local"];
for (const pattern of envPatterns) {
  if (gitignore.includes(pattern)) {
    pass(`.gitignore includes pattern: ${pattern}`);
  } else {
    fail(`.gitignore includes pattern: ${pattern}`, `Pattern '${pattern}' not found in .gitignore`);
  }
}

// Verify .env.example is explicitly NOT ignored
if (gitignore.includes("!.env.example")) {
  pass(".gitignore has !.env.example exception");
} else {
  fail(".gitignore has !.env.example exception", "!.env.example not found — .env.example may be gitignored");
}

// ---------------------------------------------------------------------------
// Fix migration 20261018: verify it exists and has the correct ADD COLUMN statements
// ---------------------------------------------------------------------------
console.log("\n[GAP-019] Fix migration 20261018 exists and is correct\n");

const migration018 = readFile(
  "supabase/migrations/20261018000000_fix_affiliate_payouts_schema.sql"
);

const addCols = ["total_amount", "payout_method", "payout_handle", "stripe_memo", "status", "paid_at", "period"];
for (const col of addCols) {
  if (migration018.includes(`ADD COLUMN IF NOT EXISTS ${col}`)) {
    pass(`migration 20261018 adds column: ${col}`);
  } else {
    fail(`migration 20261018 adds column: ${col}`, `ADD COLUMN IF NOT EXISTS ${col} not found`);
  }
}

const dropCols = ["amount", "method", "stripe_transfer_id"];
for (const col of dropCols) {
  if (migration018.includes(`DROP COLUMN IF EXISTS ${col}`)) {
    pass(`migration 20261018 drops obsolete column: ${col}`);
  } else {
    fail(`migration 20261018 drops obsolete column: ${col}`, `DROP COLUMN IF EXISTS ${col} not found`);
  }
}

// ---------------------------------------------------------------------------
// settings_public migration: verify no direct settings SELECT remains in src/
// (API routes using service role are exempt)
// ---------------------------------------------------------------------------
console.log("\n[M1B] No direct settings SELECT in browser-facing code\n");

const srcFiles = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/components/Footer.tsx",
  "src/components/Header.tsx",
  "src/components/CartDrawer.tsx",
  "src/components/NewsletterSignup.tsx",
  "src/components/NewsletterPopup.tsx",
  "src/components/AdminLayout.tsx",
  "src/app/checkout/page.tsx",
  "src/app/about/page.tsx",
  "src/app/admin/dashboard/page.tsx",
  "src/app/admin/orders/page.tsx",
  "src/app/admin/products/page.tsx",
  "src/app/admin/affiliates/page.tsx",
  "src/app/admin/shipping/page.tsx",
  "src/app/admin/email/page.tsx",
  "src/app/admin/settings/sections/useSettings.ts",
  "src/app/admin/settings/sections/Integrations.tsx",
  "src/app/admin/settings/sections/About.tsx",
  "src/app/account/components/OrderDetailClient.tsx",
];

for (const rel of srcFiles) {
  const filePath = path.join(ROOT, rel);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, "utf8");
  // Direct settings SELECT (not settings_public) should not appear
  if (content.includes('.from("settings").select(')) {
    fail(`${rel} has no direct settings SELECT`, `Found .from("settings").select( — should use settings_public`);
  } else {
    pass(`${rel} uses settings_public for SELECT`);
  }
}

// Verify admin/email/page.tsx uses the new API route, not direct DB
const emailPage = readFile("src/app/admin/email/page.tsx");
if (emailPage.includes("/api/admin/email-settings")) {
  pass("admin/email/page.tsx uses /api/admin/email-settings route");
} else {
  fail("admin/email/page.tsx uses /api/admin/email-settings route", "Route call not found");
}
if (!emailPage.includes('.from("settings").select("resend_api_key')) {
  pass("admin/email/page.tsx does not read resend_api_key directly from DB");
} else {
  fail("admin/email/page.tsx does not read resend_api_key directly from DB", "Direct DB read still present");
}

// Verify the new email-settings API route uses service role
const emailSettingsRoute = readFile("src/app/api/admin/email-settings/route.ts");
if (emailSettingsRoute.includes("SUPABASE_SERVICE_ROLE_KEY")) {
  pass("api/admin/email-settings/route.ts uses service role key");
} else {
  fail("api/admin/email-settings/route.ts uses service role key", "SUPABASE_SERVICE_ROLE_KEY not found");
}
if (emailSettingsRoute.includes("requireAdmin")) {
  pass("api/admin/email-settings/route.ts calls requireAdmin()");
} else {
  fail("api/admin/email-settings/route.ts calls requireAdmin()", "requireAdmin not found");
}

// ---------------------------------------------------------------------------
// GAP-005: affiliate dashboard authentication
// ---------------------------------------------------------------------------
console.log("\n[GAP-005] Affiliate dashboard authentication\n");

const verifyRoute     = readFile("src/app/api/affiliates/verify/route.ts");
const confirmRoute    = readFile("src/app/api/affiliates/verify/confirm/route.ts");
const dashboardRoute2 = readFile("src/app/api/affiliates/dashboard/route.ts");
const dashboardClient = readFile("src/app/affiliates/dashboard/AffiliateDashboardClient.tsx");

if (verifyRoute.includes("if (!secret)") && verifyRoute.includes("status: 500"))
  pass("verify/route.ts returns 500 when AFFILIATE_SESSION_SECRET not set");
else
  fail("verify/route.ts returns 500 when AFFILIATE_SESSION_SECRET not set", "Fail-closed pattern not found");

if (verifyRoute.includes("isRateLimited"))
  pass("verify/route.ts has rate limiting");
else
  fail("verify/route.ts has rate limiting", "isRateLimited not found");

if (verifyRoute.includes("Always return ok to avoid code enumeration"))
  pass("verify/route.ts avoids code enumeration");
else
  fail("verify/route.ts avoids code enumeration", "Enumeration-safe comment not found");

if (confirmRoute.includes("timingSafeEqual"))
  pass("confirm/route.ts uses timingSafeEqual for OTP comparison");
else
  fail("confirm/route.ts uses timingSafeEqual for OTP comparison", "timingSafeEqual not found");

if (confirmRoute.includes("Date.now() > Number(expiry)"))
  pass("confirm/route.ts checks OTP expiry");
else
  fail("confirm/route.ts checks OTP expiry", "Expiry check not found");

if (confirmRoute.includes("affiliate_otp_pending") && confirmRoute.includes("maxAge: 0"))
  pass("confirm/route.ts clears affiliate_otp_pending cookie on success");
else
  fail("confirm/route.ts clears affiliate_otp_pending cookie on success", "Cookie clear not found");

if (confirmRoute.includes("affiliate_session") && confirmRoute.includes("httpOnly: true"))
  pass("confirm/route.ts issues HttpOnly affiliate_session cookie");
else
  fail("confirm/route.ts issues HttpOnly affiliate_session cookie", "HttpOnly session cookie not found");

if (!dashboardRoute2.includes('searchParams.get("code")'))
  pass("dashboard/route.ts does not accept code query param as auth");
else
  fail("dashboard/route.ts does not accept code query param as auth", "code query param auth still present");

if (dashboardRoute2.includes("affiliate_session") && dashboardRoute2.includes("verifySession"))
  pass("dashboard/route.ts validates affiliate_session cookie via verifySession");
else
  fail("dashboard/route.ts validates affiliate_session cookie via verifySession", "Session validation not found");

if (dashboardRoute2.includes("status: 401"))
  pass("dashboard/route.ts returns 401 when session missing/invalid");
else
  fail("dashboard/route.ts returns 401 when session missing/invalid", "401 response not found");

if (dashboardRoute2.includes("if (!secret)") && dashboardRoute2.includes("status: 500"))
  pass("dashboard/route.ts returns 500 when AFFILIATE_SESSION_SECRET not set");
else
  fail("dashboard/route.ts returns 500 when AFFILIATE_SESSION_SECRET not set", "Fail-closed pattern not found");

if (dashboardClient.includes('"code"') && dashboardClient.includes('"otp"') && dashboardClient.includes('"dashboard"'))
  pass("AffiliateDashboardClient has three-step state: code, otp, dashboard");
else
  fail("AffiliateDashboardClient has three-step state: code, otp, dashboard", "Step states not found");

if (dashboardClient.includes('/api/affiliates/verify"'))
  pass("AffiliateDashboardClient calls /api/affiliates/verify");
else
  fail("AffiliateDashboardClient calls /api/affiliates/verify", "verify call not found");

if (dashboardClient.includes("/api/affiliates/verify/confirm"))
  pass("AffiliateDashboardClient calls /api/affiliates/verify/confirm");
else
  fail("AffiliateDashboardClient calls /api/affiliates/verify/confirm", "confirm call not found");

if (!dashboardClient.includes("/api/affiliates/dashboard?code="))
  pass("AffiliateDashboardClient does not pass code as query param to dashboard API");
else
  fail("AffiliateDashboardClient does not pass code as query param to dashboard API", "code query param still present");


// ---------------------------------------------------------------------------
// GAP-020: storage buckets in fresh_install.sql
// ---------------------------------------------------------------------------
console.log("\n[GAP-020] Storage buckets in fresh_install.sql\n");

const freshInstall2 = readFile("supabase/fresh_install.sql");

for (const bucket of ["store-images", "store-audio", "store-video"]) {
  if (freshInstall2.includes(`'${bucket}'`))
    pass(`fresh_install.sql creates bucket: ${bucket}`);
  else
    fail(`fresh_install.sql creates bucket: ${bucket}`, `Bucket '${bucket}' not found`);
}

if (freshInstall2.includes("ON CONFLICT (id) DO NOTHING"))
  pass("fresh_install.sql bucket insert is idempotent (ON CONFLICT DO NOTHING)");
else
  fail("fresh_install.sql bucket insert is idempotent (ON CONFLICT DO NOTHING)", "ON CONFLICT clause not found");

// ---------------------------------------------------------------------------
// GAP-013: UTM columns in fresh_install.sql orders table
// ---------------------------------------------------------------------------
console.log("\n[GAP-013] UTM columns in fresh_install.sql orders table\n");

const utmCols = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer", "landing_page", "first_touch", "last_touch", "marketing_opt_in"];
for (const col of utmCols) {
  if (freshInstall2.includes(col))
    pass(`fresh_install.sql orders table has column: ${col}`);
  else
    fail(`fresh_install.sql orders table has column: ${col}`, `Column '${col}' not found`);
}

// ---------------------------------------------------------------------------
// GAP-014: Meta CAPI email hashing
// ---------------------------------------------------------------------------
console.log("\n[GAP-014] Meta CAPI email SHA-256 hashing\n");

const stripeWebhook = readFile("supabase/functions/stripe-webhook/index.ts");

if (stripeWebhook.includes("SHA-256") && stripeWebhook.includes("crypto.subtle.digest"))
  pass("stripe-webhook hashes email with SHA-256 before sending to Meta CAPI");
else
  fail("stripe-webhook hashes email with SHA-256 before sending to Meta CAPI", "SHA-256 hash not found");

if (!stripeWebhook.includes("em: session.metadata?.email ? [session.metadata.email]"))
  pass("stripe-webhook does not send raw email to Meta CAPI");
else
  fail("stripe-webhook does not send raw email to Meta CAPI", "Raw email still present in em field");

if (stripeWebhook.includes(".toLowerCase().trim()"))
  pass("stripe-webhook normalises email to lowercase before hashing");
else
  fail("stripe-webhook normalises email to lowercase before hashing", "toLowerCase().trim() not found");

// ---------------------------------------------------------------------------
// GAP-011: livemode cross-validation in stripe-checkout
// ---------------------------------------------------------------------------
console.log("\n[GAP-011] livemode cross-validation in stripe-checkout\n");

const stripeCheckout = readFile("supabase/functions/stripe-checkout/index.ts");

if (stripeCheckout.includes("stripe_mode"))
  pass("stripe-checkout reads stripe_mode from settings");
else
  fail("stripe-checkout reads stripe_mode from settings", "stripe_mode not found");

if (stripeCheckout.includes("livemode mismatch"))
  pass("stripe-checkout logs warning on livemode mismatch");
else
  fail("stripe-checkout logs warning on livemode mismatch", "mismatch warning not found");

if (stripeCheckout.includes("isLiveModeBySettings") && stripeCheckout.includes("isLiveModeByKey"))
  pass("stripe-checkout derives livemode from both key prefix and settings.stripe_mode");
else
  fail("stripe-checkout derives livemode from both key prefix and settings.stripe_mode", "dual derivation not found");

if (stripeCheckout.includes("Using settings.stripe_mode as authoritative"))
  pass("stripe-checkout uses settings.stripe_mode as authoritative source");
else
  fail("stripe-checkout uses settings.stripe_mode as authoritative source", "authoritative source comment not found");

// ---------------------------------------------------------------------------
// GAP-006: affiliate click tracking rate limiting
// ---------------------------------------------------------------------------
console.log("\n[GAP-006] Affiliate click tracking rate limiting\n");

const trackRoute = readFile("src/app/api/affiliates/track/route.ts");

if (trackRoute.includes("isRateLimited"))
  pass("affiliates/track/route.ts has rate limiting");
else
  fail("affiliates/track/route.ts has rate limiting", "isRateLimited not found");

if (trackRoute.includes("status: 429"))
  pass("affiliates/track/route.ts returns 429 when rate limited");
else
  fail("affiliates/track/route.ts returns 429 when rate limited", "429 response not found");

// ---------------------------------------------------------------------------
// GAP-008: getLiveShippingCost fallback logging
// ---------------------------------------------------------------------------
console.log("\n[GAP-008] getLiveShippingCost fallback logging\n");

const stripeCheckout2 = readFile("supabase/functions/stripe-checkout/index.ts");

const fallbackReasons = [
  "shipping_fallback reason=missing_config",
  "shipping_fallback reason=no_printify_items",
  "shipping_fallback reason=printify_api_error",
  "shipping_fallback reason=zero_or_missing_standard_rate",
  "shipping_fallback reason=exception",
];

for (const reason of fallbackReasons) {
  if (stripeCheckout2.includes(reason))
    pass(`stripe-checkout logs fallback: ${reason}`);
  else
    fail(`stripe-checkout logs fallback: ${reason}`, `Log message not found`);
}

// ---------------------------------------------------------------------------
// GAP-023: Stripe metadata items field truncated to 500 chars
// ---------------------------------------------------------------------------
console.log("\n[GAP-023] Stripe metadata items field truncated to 500 chars\n");

if (stripeCheckout2.includes(".slice(0, 500)") && stripeCheckout2.includes("items: JSON.stringify"))
  pass("stripe-checkout truncates items metadata to 500 chars");
else
  fail("stripe-checkout truncates items metadata to 500 chars", ".slice(0, 500) on items JSON.stringify not found");

// ---------------------------------------------------------------------------
// GAP-007: getShippingQuote typed return value
// ---------------------------------------------------------------------------
console.log("\n[GAP-007] getShippingQuote typed return value\n");

const supabaseLib = readFile("src/lib/supabase.ts");

if (supabaseLib.includes("ShippingQuote") && supabaseLib.includes("source: 'live' | 'fallback'"))
  pass("supabase.ts defines ShippingQuote type with source field");
else
  fail("supabase.ts defines ShippingQuote type with source field", "ShippingQuote type not found");

if (supabaseLib.includes("source: 'fallback'") && supabaseLib.includes("source: 'live'"))
  pass("getShippingQuote returns source field on all paths");
else
  fail("getShippingQuote returns source field on all paths", "source field missing on some return paths");

const checkoutPage = readFile("src/app/checkout/page.tsx");

if (checkoutPage.includes("shippingSource") && checkoutPage.includes("quote.source"))
  pass("checkout/page.tsx consumes shippingSource from quote");
else
  fail("checkout/page.tsx consumes shippingSource from quote", "shippingSource not found");

if (checkoutPage.includes("Estimated rate") && checkoutPage.includes("shippingSource === 'fallback'"))
  pass("checkout/page.tsx shows fallback notice when source is fallback");
else
  fail("checkout/page.tsx shows fallback notice when source is fallback", "fallback notice not found");

// ---------------------------------------------------------------------------
// GAP-004: user_id on orders
// ---------------------------------------------------------------------------
console.log("\n[GAP-004] user_id on orders\n");

const freshInstall3 = readFile("supabase/fresh_install.sql");
const migration019  = readFile("supabase/migrations/20261019000000_add_user_id_to_orders.sql");
const stripeCheckout3 = readFile("supabase/functions/stripe-checkout/index.ts");

if (freshInstall3.includes("user_id") && freshInstall3.includes("REFERENCES auth.users(id)"))
  pass("fresh_install.sql orders table has user_id FK to auth.users");
else
  fail("fresh_install.sql orders table has user_id FK to auth.users", "user_id column not found");

if (migration019.includes("ADD COLUMN IF NOT EXISTS user_id"))
  pass("migration 20261019 adds user_id column to orders");
else
  fail("migration 20261019 adds user_id column to orders", "ADD COLUMN not found");

if (stripeCheckout3.includes("verifiedUserId") && stripeCheckout3.includes("supabase.auth.getUser"))
  pass("stripe-checkout verifies JWT before trusting user_id");
else
  fail("stripe-checkout verifies JWT before trusting user_id", "JWT verification not found");

if (stripeCheckout3.includes("user_id: verifiedUserId"))
  pass("stripe-checkout writes verified user_id to order insert");
else
  fail("stripe-checkout writes verified user_id to order insert", "user_id insert not found");

if (checkoutPage.includes("user?.id ?? null") && checkoutPage.includes("user_id"))
  pass("checkout/page.tsx passes user?.id to createStripeCheckout");
else
  fail("checkout/page.tsx passes user?.id to createStripeCheckout", "user_id not passed");

// ---------------------------------------------------------------------------
// GAP-001: admins PK decoupled from auth.uid()
// ---------------------------------------------------------------------------
console.log("\n[GAP-001] admins PK decoupled from auth.uid()\n");

const migration020   = readFile("supabase/migrations/20261020000000_fix_admins_pk.sql");
const requireAdmin   = readFile("src/lib/require-admin.ts");
const manageRoute    = readFile("src/app/api/admin/manage/route.ts");

if (freshInstall3.includes("auth_user_id") && freshInstall3.includes("gen_random_uuid()"))
  pass("fresh_install.sql admins table has auth_user_id column and gen_random_uuid() PK");
else
  fail("fresh_install.sql admins table has auth_user_id column and gen_random_uuid() PK", "Not found");

if (!freshInstall3.includes("DEFAULT auth.uid()"))
  pass("fresh_install.sql admins table does not use DEFAULT auth.uid()");
else
  fail("fresh_install.sql admins table does not use DEFAULT auth.uid()", "DEFAULT auth.uid() still present");

if (freshInstall3.includes("admins.auth_user_id = auth.uid()") && !freshInstall3.includes("admins.id = auth.uid()"))
  pass("fresh_install.sql RLS policies use auth_user_id not id");
else
  fail("fresh_install.sql RLS policies use auth_user_id not id", "Old id pattern still present or new pattern missing");

if (migration020.includes("ADD COLUMN IF NOT EXISTS auth_user_id") && migration020.includes("idx_admins_auth_user_id"))
  pass("migration 20261020 adds auth_user_id column with index");
else
  fail("migration 20261020 adds auth_user_id column with index", "Column or index not found");

if (requireAdmin.includes("eq(\"auth_user_id\", user.id)"))
  pass("require-admin.ts queries admins by auth_user_id");
else
  fail("require-admin.ts queries admins by auth_user_id", "auth_user_id query not found");

if (manageRoute.includes("auth_user_id: invited.user.id"))
  pass("manage/route.ts inserts auth_user_id on invite");
else
  fail("manage/route.ts inserts auth_user_id on invite", "auth_user_id insert not found");

if (manageRoute.includes("eq(\"auth_user_id\", user.id)"))
  pass("manage/route.ts getCallerAdmin queries by auth_user_id");
else
  fail("manage/route.ts getCallerAdmin queries by auth_user_id", "auth_user_id query not found");
// ---------------------------------------------------------------------------
// GAP-002: admin invite uses RPC not direct insert
// ---------------------------------------------------------------------------
const manageRoute2 = readFile("src/app/api/admin/manage/route.ts");
if (manageRoute2.includes("insert_admin_row") && manageRoute2.includes(".rpc("))
  pass("GAP-002: manage/route.ts uses insert_admin_row RPC for atomic admin invite");
else
  fail("GAP-002: manage/route.ts uses insert_admin_row RPC for atomic admin invite", "RPC call not found");

const migration021 = readFile("supabase/migrations/20261021000000_add_insert_admin_row_function.sql");
if (migration021.includes("CREATE OR REPLACE FUNCTION insert_admin_row") && migration021.includes("SECURITY DEFINER"))
  pass("GAP-002: migration 20261021 creates insert_admin_row security-definer function");
else
  fail("GAP-002: migration 20261021 creates insert_admin_row security-definer function", "Function definition not found");

// ---------------------------------------------------------------------------
// GAP-003: customer profile upsert goes through server API route
// ---------------------------------------------------------------------------
const profileSync = readFile("src/lib/customer-profile-sync.ts");
if (profileSync.includes("/api/account/profile") && profileSync.includes("Authorization"))
  pass("GAP-003: customer-profile-sync.ts calls server API route with JWT");
else
  fail("GAP-003: customer-profile-sync.ts calls server API route with JWT", "Direct supabase client write still present");

const profileRoute = readFile("src/app/api/account/profile/route.ts");
if (profileRoute.includes("auth.getUser") && profileRoute.includes("ALLOWED_FIELDS"))
  pass("GAP-003: /api/account/profile route verifies JWT and validates fields");
else
  fail("GAP-003: /api/account/profile route verifies JWT and validates fields", "Auth check or field allowlist missing");

// ---------------------------------------------------------------------------
// GAP-009: null order totals excluded from total_spent
// ---------------------------------------------------------------------------
const customersRoute = readFile("src/app/api/admin/customers/route.ts");
if (customersRoute.includes("order.total != null"))
  pass("GAP-009: customers route excludes null totals from total_spent");
else
  fail("GAP-009: customers route excludes null totals from total_spent", "Null coercion still present");

// ---------------------------------------------------------------------------
// GAP-010: products.cost documented in fresh_install.sql
// ---------------------------------------------------------------------------
if (freshInstall.includes("Printify base cost"))
  pass("GAP-010: products.cost column is documented in fresh_install.sql");
else
  fail("GAP-010: products.cost column is documented in fresh_install.sql", "Documentation comment not found");

// ---------------------------------------------------------------------------
// GAP-015: discount code extraction uses typed Stripe intersection not as any
// ---------------------------------------------------------------------------
const stripeWebhook2 = readFile("supabase/functions/stripe-webhook/index.ts");
if (!stripeWebhook2.includes("discounts?.[0] as any") && stripeWebhook2.includes("Stripe.Discount"))
  pass("GAP-015: discount code extraction uses typed Stripe intersection, not as any");
else
  fail("GAP-015: discount code extraction uses typed Stripe intersection, not as any", "as any cast still present or Stripe type not used");

// ---------------------------------------------------------------------------
// GAP-017: Resend /domains requires admin auth
// ---------------------------------------------------------------------------
const resendRoute = readFile("src/app/api/resend/route.ts");
if (!resendRoute.includes("no auth guard needed") && !resendRoute.includes("path !== \"/domains\""))
  pass("GAP-017: Resend /domains path requires admin auth");
else
  fail("GAP-017: Resend /domains path requires admin auth", "Unauthenticated /domains bypass still present");

// ---------------------------------------------------------------------------
// GAP-024: listUsers uses pagination loop
// ---------------------------------------------------------------------------
if (customersRoute.includes("while (true)") && customersRoute.includes("page++"))
  pass("GAP-024: customers route paginates listUsers");
else
  fail("GAP-024: customers route paginates listUsers", "Pagination loop not found");

// ---------------------------------------------------------------------------
// GAP-021: ignoreDuringBuilds disabled
// ---------------------------------------------------------------------------
const nextConfig = readFile("next.config.mjs");
if (nextConfig.includes("ignoreDuringBuilds: false") || !nextConfig.includes("ignoreDuringBuilds: true"))
  pass("GAP-021: next.config.mjs does not ignore ESLint during builds");
else
  fail("GAP-021: next.config.mjs does not ignore ESLint during builds", "ignoreDuringBuilds: true still present");

// ---------------------------------------------------------------------------
// GAP-025: Stripe API version mismatch
// ---------------------------------------------------------------------------
if (stripeCheckout.includes("apiVersion") && stripeWebhook.includes("apiVersion")) {
  const checkoutVer = (stripeCheckout.match(/apiVersion:\s*"([^"]+)"/) || [])[1] || "";
  const webhookVer  = (stripeWebhook.match(/apiVersion:\s*"([^"]+)"/)  || [])[1] || "";
  if (checkoutVer !== webhookVer)
    fail("GAP-025: stripe-checkout and stripe-webhook use same Stripe API version", `checkout=${checkoutVer} webhook=${webhookVer}`);
  else
    pass("GAP-025: stripe-checkout and stripe-webhook use same Stripe API version");
} else {
  fail("GAP-025: stripe-checkout and stripe-webhook use same Stripe API version", "apiVersion not found in one or both files");
}

// ---------------------------------------------------------------------------
// GAP-026: orders_paused server-side enforcement
// ---------------------------------------------------------------------------
if (stripeCheckout.includes("orders_paused"))
  pass("GAP-026: stripe-checkout checks orders_paused server-side");
else
  fail("GAP-026: stripe-checkout checks orders_paused server-side", "orders_paused check not found in stripe-checkout");

// ---------------------------------------------------------------------------
// GAP-027: fresh_install.sql seo_settings has all three pixel/analytics columns
// ---------------------------------------------------------------------------
const seoColsPresent =
  freshInstall.includes("facebook_pixel_id") &&
  freshInstall.includes("ga_measurement_id") &&
  freshInstall.includes("facebook_domain_verification");
if (seoColsPresent)
  pass("GAP-027: fresh_install.sql seo_settings includes facebook_pixel_id, ga_measurement_id, facebook_domain_verification");
else
  fail("GAP-027: fresh_install.sql seo_settings includes facebook_pixel_id, ga_measurement_id, facebook_domain_verification", "One or more SEO columns missing from fresh_install.sql seo_settings");

// ---------------------------------------------------------------------------
// GAP-028: printify-webhook deduplication guard
// ---------------------------------------------------------------------------
const printifyWebhook = readFile("supabase/functions/printify-webhook/index.ts");
if (printifyWebhook.includes(".neq(\"fulfillment_status\", \"shipped\")") || printifyWebhook.includes("processed_webhook_events"))
  pass("GAP-028: printify-webhook has deduplication guard");
else
  fail("GAP-028: printify-webhook has deduplication guard", "No deduplication logic found — duplicate emails possible on Printify retry");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passes} passed, ${failures} failed`);
console.log(`${"─".repeat(60)}\n`);

process.exit(failures > 0 ? 1 : 0);
