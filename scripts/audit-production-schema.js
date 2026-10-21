#!/usr/bin/env node
/**
 * scripts/audit-production-schema.js
 *
 * Connects to the linked Supabase project and audits:
 *   1. Which migrations are recorded as applied
 *   2. Which expected columns are missing from key tables
 *   3. Whether the settings_public view exists
 *   4. Whether RLS is enabled on sensitive tables
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
 *     node scripts/audit-production-schema.js
 *
 * Get your DB URL from: Supabase Dashboard → Settings → Database → Connection string (URI)
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("ERROR: SUPABASE_DB_URL environment variable is required.");
  console.error('  export SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"');
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(__dirname, "../supabase/migrations");

let passes = 0;
let failures = 0;
let warnings = 0;

function pass(name) { console.log(`  ✓  ${name}`); passes++; }
function fail(name, detail) { console.error(`  ✗  ${name}\n       → ${detail}`); failures++; }
function warn(name, detail) { console.warn(`  ⚠  ${name}\n       → ${detail}`); warnings++; }

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log("Connected to production database.\n");

  // ── 1. Migration status ──────────────────────────────────────────────────
  console.log("── Migration status ──────────────────────────────────────────");

  const { rows: applied } = await client.query(
    `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`
  );
  const appliedSet = new Set(applied.map((r) => r.version));

  const localFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let pendingCount = 0;
  for (const file of localFiles) {
    // Supabase version = filename without extension
    const version = file.replace(/\.sql$/, "");
    if (appliedSet.has(version)) {
      pass(`Applied: ${file}`);
    } else {
      fail(`PENDING (not applied): ${file}`, "Run: supabase db push --linked");
      pendingCount++;
    }
  }

  // Migrations in DB but not in local files (manual changes / drift)
  for (const { version } of applied) {
    const hasLocal = localFiles.some((f) => f.replace(/\.sql$/, "") === version);
    if (!hasLocal) {
      warn(`In DB but no local file: ${version}`, "Schema drift — consider creating a migration for this");
    }
  }

  // ── 2. Column existence on key tables ───────────────────────────────────
  console.log("\n── Column existence ──────────────────────────────────────────");

  const expectedColumns = {
    settings: [
      "id", "store_name", "tagline", "stripe_mode",
      "stripe_live_secret_key", "stripe_live_webhook_secret",
      "stripe_test_secret_key", "stripe_test_webhook_secret",
      "resend_api_key", "email_from", "email_support",
      "favicon_url", "social_links", "site_menu_settings",
      "affiliate_program_enabled", "singleton",
      "facebook_domain_verification", "announcement", "announcement_active",
      "orders_paused", "shipping_free_threshold", "default_shipping_cost",
    ],
    orders: [
      "id", "email", "status", "total", "livemode",
      "printify_order_id", "fulfillment_status", "tracking_number",
      "user_id", "affiliate_code",
      "utm_source", "utm_medium", "utm_campaign",
    ],
    admins: ["id", "email", "auth_user_id"],
    affiliate_payouts: [
      "id", "total_amount", "payout_method", "payout_handle",
      "stripe_memo", "status", "paid_at", "period",
    ],
  };

  for (const [table, cols] of Object.entries(expectedColumns)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    const existing = new Set(rows.map((r) => r.column_name));
    for (const col of cols) {
      if (existing.has(col)) {
        pass(`${table}.${col} exists`);
      } else {
        fail(`${table}.${col} MISSING`, `Column not found — check pending migrations above`);
      }
    }
  }

  // ── 3. Views ─────────────────────────────────────────────────────────────
  console.log("\n── Views ─────────────────────────────────────────────────────");

  const { rows: views } = await client.query(
    `SELECT viewname FROM pg_views WHERE schemaname = 'public'`
  );
  const viewNames = new Set(views.map((r) => r.viewname));

  if (viewNames.has("settings_public")) {
    pass("settings_public view exists");

    // Verify secret columns are NOT in the view
    const { rows: viewCols } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'settings_public'`
    );
    const viewColSet = new Set(viewCols.map((r) => r.column_name));
    const secretCols = [
      "stripe_live_secret_key", "stripe_live_webhook_secret",
      "stripe_test_secret_key", "stripe_test_webhook_secret",
      "resend_api_key", "email_from", "email_support",
    ];
    for (const col of secretCols) {
      if (!viewColSet.has(col)) {
        pass(`settings_public excludes secret column: ${col}`);
      } else {
        fail(`settings_public EXPOSES secret column: ${col}`, "View must be recreated without this column");
      }
    }
  } else {
    fail("settings_public view MISSING", "Migration 20261017000000 may not have been applied");
  }

  // ── 4. RLS enabled on sensitive tables ───────────────────────────────────
  console.log("\n── RLS status ────────────────────────────────────────────────");

  const rlsTables = ["settings", "orders", "admins", "products", "affiliates", "affiliate_payouts", "customer_profiles"];
  const { rows: rlsRows } = await client.query(
    `SELECT relname, relrowsecurity FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`
  );
  const rlsMap = Object.fromEntries(rlsRows.map((r) => [r.relname, r.relrowsecurity]));

  for (const table of rlsTables) {
    if (rlsMap[table] === true) {
      pass(`RLS enabled: ${table}`);
    } else if (rlsMap[table] === false) {
      fail(`RLS DISABLED: ${table}`, "Run: ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;");
    } else {
      warn(`Table not found: ${table}`, "May not exist yet");
    }
  }

  // ── 5. Functions ──────────────────────────────────────────────────────────
  console.log("\n── Functions ─────────────────────────────────────────────────");

  const { rows: funcs } = await client.query(
    `SELECT proname FROM pg_proc
     JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
     WHERE nspname = 'public'`
  );
  const funcNames = new Set(funcs.map((r) => r.proname));

  for (const fn of ["insert_admin_row"]) {
    if (funcNames.has(fn)) {
      pass(`Function exists: ${fn}`);
    } else {
      fail(`Function MISSING: ${fn}`, "Migration 20261021000000 may not have been applied");
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  await client.end();
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${passes} passed, ${failures} failed, ${warnings} warnings`);
  console.log(`${"─".repeat(60)}\n`);

  if (failures > 0) {
    console.log("Fix failures before deploying. Run pending migrations with:");
    console.log("  supabase db push --linked\n");
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
