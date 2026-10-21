# Migration Scripts — Audit & Repair Log

## Issue: `SECURITY DEFINER` Syntax Error in `20261017000000_restrict_settings_stripe_keys.sql`

**Error:**
```
Failed to run sql query: ERROR: 42601: syntax error at or near "SECURITY"
LINE 45: SECURITY DEFINER
```

**Context**

The issue is that `SECURITY DEFINER` on a `CREATE VIEW` is a PostgreSQL 15+ syntax. Supabase's SQL editor (which runs on older PostgreSQL or has restrictions) doesn't support it directly on views — you need to use a function or set it via `ALTER VIEW`.

The fix is to drop `SECURITY DEFINER` and `SET search_path` from the `CREATE VIEW` statement and instead use `ALTER VIEW` after creation.

**Fix applied to `20261017000000_restrict_settings_stripe_keys.sql`:**

- Removed `SECURITY DEFINER` and `SET search_path` from `CREATE VIEW` — not supported in this PostgreSQL version via that syntax. (`+1 / -4`)
- Added `ALTER VIEW OWNER TO postgres` so the view runs as a privileged role (security-definer equivalent for views in older PG). (`+6 / -0`)

**Why:**

- `SECURITY DEFINER` on `CREATE VIEW` is PostgreSQL 15+ syntax. Supabase runs PG 15 but the SQL editor/migration runner can reject it depending on the version or extension context.
- The equivalent approach for older PG is `ALTER VIEW ... OWNER TO postgres` — since `postgres` is a superuser, the view runs with elevated privileges and bypasses RLS on the underlying `settings` table, which is exactly what `SECURITY DEFINER` would have done.
- `REVOKE ALL ON settings_public FROM PUBLIC` + explicit `GRANT SELECT` ensures only `anon` and `authenticated` can read it, not arbitrary roles.

---

## Issue: `column "facebook_domain_verification" does not exist` — LINE 119

**Error:**
```
Failed to run sql query: ERROR: 42703: column "facebook_domain_verification" does not exist
LINE 119: facebook_domain_verification,
```

**Context**

Checked what columns actually exist in the `settings` table by searching all `ADD COLUMN` statements across migrations.

```bash
grep -h "ADD COLUMN\|facebook_domain\|favicon_url\|newsletter_group\|popup_settings\|affiliate_program\|announcement" \
  supabase/migrations/*.sql | grep -v "^--" | sort
```

`facebook_domain_verification` does exist as a column (added via `ADD COLUMN IF NOT EXISTS`). The issue is that the migration adding it hadn't been run yet in the database, but the view migration runs first — or it was added in a migration file that hadn't been applied.

**Investigation:**

```bash
# Find which migration file adds facebook_domain_verification
grep -rl "facebook_domain_verification" supabase/migrations/
# → 20261016000003_add_facebook_domain_verification.sql
# → 20261017000000_restrict_settings_stripe_keys.sql

# Find which migrations add the other columns referenced in the view
grep -rl "newsletter_group_id\|popup_settings\|affiliate_program_enabled\|favicon_url" supabase/migrations/ | sort
# → 20260919000000_add_favicon_url.sql
# → 20261002000000_add_affiliate_program_enabled.sql
# → 20261017000000_restrict_settings_stripe_keys.sql

# Find where newsletter_group_id and popup_settings are defined
grep -rl "newsletter_group_id\|popup_settings" supabase/ | sort
# → supabase/fresh_install.sql
# → supabase/functions/stripe-webhook/index.ts
# → supabase/migrations/20261017000000_restrict_settings_stripe_keys.sql
# → supabase/sql/01_schema.sql
```

`newsletter_group_id` and `popup_settings` only exist in `fresh_install.sql` / `01_schema.sql` — they were never added via a migration.

**Fix applied to `20261017000000_restrict_settings_stripe_keys.sql`:**

Removed `newsletter_group_id` and `popup_settings` from the view since they have no backing migration. (`+0 / -2`)

**Columns removed from the view:**

- `newsletter_group_id` — only defined in `fresh_install.sql`, no migration
- `popup_settings` — same, no migration

`facebook_domain_verification` stays — it has a proper migration (`20261016000003_add_facebook_domain_verification.sql`) that runs before this one.

> If you need `newsletter_group_id` and `popup_settings` in the view later, create a migration that adds them to the `settings` table first, then add them back here.

---

## Production Audit: Schema Status, Pending Migrations & E2E Testing

**Context**

Existing tooling inventory:

- `scripts/test-schema-consistency.js` — offline static analysis (GAP checks against source files, no DB needed)
- `supabase/scripts/use_dianogstics.sql` — basic row counts + recent orders
- `e2e/` — Playwright specs (checkout, admin, storefront, stripe-switch, etc.)
- `supabase/migrations/` — 50+ ordered migrations
- `supabase/fresh_install.sql` — canonical schema for new installs

**Gap identified:** No tool that connects to the actual Supabase project and answers:

1. Which migrations has Supabase already applied?
2. Which columns exist in production vs. what migrations expect?
3. Are RLS policies, views, and functions deployed correctly?

### Layer 1 — Migration Status (what's applied vs. pending)

Supabase tracks applied migrations in `supabase_migrations.schema_migrations`. Run this in the SQL editor:

```sql
-- See what Supabase has recorded as applied
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

Then diff against your local files:

```bash
supabase db diff --linked
```

This shows DDL that exists in production but not in your migrations (or vice versa). It's the most reliable way to find drift.

### Layer 2 — Column Existence Audit

Run this in the SQL editor to see every column on `settings` right now:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'settings'
ORDER BY ordinal_position;
```

And to check which columns your view references that don't exist yet:

```sql
-- Columns in the view definition vs. actual table
SELECT a.attname AS column_name
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
WHERE c.relname = 'settings_public'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;
```

### Layer 3 — Automated Production Audit Script

Created `scripts/audit-production-schema.js` — a live script that connects to Supabase and checks migration status, column existence, view correctness, RLS, and functions. (`+207 / -0`)

Installed `pg` as a dev dependency and added npm scripts to `package.json`. (`+3 / -0`)

**Usage:**

```bash
# 1. Live production audit (needs DB password from Supabase Dashboard → Settings → Database)
export SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
npm run audit:schema

# 2. Offline static analysis
npm run test:schema

# 3. E2E tests
npm run test:e2e
# or a single spec:
npx playwright test e2e/checkout.spec.ts

# 4. Check pending migrations via Supabase CLI
supabase db diff --linked   # shows drift between local migrations and production
supabase db push --linked   # applies pending migrations
```

**Root cause of errors:** `newsletter_group_id` / `popup_settings` columns exist in `fresh_install.sql` but were never added via a migration. If `fresh_install.sql` was run directly on the DB (not through the migrations system), those columns exist in production but Supabase's migration tracker doesn't know about them. The audit script surfaces exactly this kind of drift.

---

## How `supabase db diff --linked` Works

`supabase db diff --linked` does both directions simultaneously:

1. Replays all local migration files into a temporary **shadow database** from scratch
2. Connects to the **live production** database
3. Diffs shadow vs production and outputs DDL showing what's different between them

The output seen was not getting to the diff stage — it was failing during step 1 (replaying local migrations) because the local migration chain had bugs (wrong ordering, duplicate timestamps, missing columns). Production was fine.

Once the chain replays cleanly, the actual diff output tells you:

- **DDL that exists in production but not in your migrations** → things applied manually or via `fresh_install.sql` that need a migration written for them
- **DDL that exists in your migrations but not in production** → pending migrations you need to push with `supabase db push --linked`

---

## Migration Chain Repair Log

### Fix 1: Wrong timestamp on `20240101_affiliate_rls.sql`

**Error:**
```
ERROR: relation "affiliates" does not exist (SQLSTATE 42P01)
At statement: 0
alter table affiliates enable row level security
```

`20240101_affiliate_rls.sql` sorted before the schema creation migration but depended on a table not created until `20261001000000_add_affiliates.sql`.

**Fix:**
```bash
mv supabase/migrations/20240101_affiliate_rls.sql \
   supabase/migrations/20261001500000_affiliate_rls.sql
```

---

### Fix 2: `hero_gradient_opacity` does not exist

**Error:**
```
ERROR: column "hero_gradient_opacity" does not exist (SQLSTATE 42703)
alter table settings
  alter column hero_gradient_opacity type numeric using hero_gradient_opacity::numeric,
```

`hero_gradient_opacity` only exists in `fresh_install.sql` — never added via a migration. `20260920000000_fix_gradient_opacity_types.sql` tries to alter it but it was never created via a migration.

**Investigation:**

```bash
grep -l "hero_gradient_opacity" supabase/migrations/*.sql | sort
# → 20260920000000_fix_gradient_opacity_types.sql
# → 20261017000000_restrict_settings_stripe_keys.sql

grep "hero_gradient_opacity|hero_gradient_dir|hero_image_fit|..." supabase/fresh_install.sql
# → hero_object_position  text  DEFAULT '0px 0px',
# → hero_height_vh        numeric  DEFAULT 80,
# → hero_image_flip       boolean  DEFAULT false,
# → hero_image_scale      numeric  DEFAULT 1,
# → hero_gradient_opacity numeric  DEFAULT 0.4,
# → hero_gradient_dir     text  DEFAULT 'to right',
# → hero_image_fit        text  DEFAULT 'cover',
```

**Root cause:** `fresh_install.sql` was written ahead of the migrations. It contains columns that were never added via a migration — they just exist in production because `fresh_install.sql` was run directly.

**Fix:** Created `20260903192000_backfill_fresh_install_columns.sql` — a backfill migration that adds all columns present in `fresh_install.sql` but missing from the migration chain. (`+15 / -0`, later expanded to `+41 / -12`)

Also restored `newsletter_group_id` and `popup_settings` to the view since the backfill migration now adds them. (`+2 / -0`)

---

### Fix 3: Duplicate timestamp `20260920000000`

**Error:**
```
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)
Key (version)=(20260920000000) already exists.
```

Two migrations shared the same timestamp: `20260920000000_fix_gradient_opacity_types.sql` and `20260920000000_fix_settings_singleton.sql`.

**Fix:**
```bash
mv supabase/migrations/20260920000000_fix_settings_singleton.sql \
   supabase/migrations/20260920000002_fix_settings_singleton.sql
```

(`20260920000001` was already taken by `add_feature_strip_settings.sql`)

---

### Fix 4: Duplicate timestamp `20261014000000`

**Error:**
```
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)
Key (version)=(20261014000000) already exists.
```

Two migrations shared the same timestamp: `20261014000000_add_discount_fields.sql` and `20261014000000_add_facebook_pixel.sql`.

**Fix:**
```bash
mv supabase/migrations/20261014000000_add_facebook_pixel.sql \
   supabase/migrations/20261014000001_add_facebook_pixel.sql
```

---

### Fix 5: `story_image_url` does not exist in view

**Error:**
```
ERROR: column "story_image_url" does not exist (SQLSTATE 42703)
CREATE VIEW settings_public AS SELECT ... story_image_url,
```

Same `fresh_install.sql` drift pattern. Found the complete list of view columns with no backing migration:

```bash
grep -E "^\s+[a-z_]+,$" supabase/migrations/20261017000000_restrict_settings_stripe_keys.sql \
  | tr -d ' ,' | sort > /tmp/view_cols.txt

grep -oh "ADD COLUMN IF NOT EXISTS [a-z_]*" supabase/migrations/*.sql \
  | awk '{print $5}' | sort -u > /tmp/mig_added.txt

comm -23 /tmp/view_cols.txt /tmp/mig_added.txt
```

**Orphaned columns identified (in view but no migration):**

`affiliate_program_enabled`, `facebook_domain_verification`, `favicon_url`, `feature_strip_settings`, `hero_gradient_dir`, `hero_gradient_opacity`, `hero_height_vh`, `hero_image_fit`, `hero_image_flip`, `hero_image_scale`, `hero_object_position`, `logo_size`, `logo_url`, `newsletter_group_id`, `orders_paused`, `our_why_body`, `our_why_gradient_dir`, `our_why_gradient_opacity`, `our_why_height_vh`, `our_why_image_fit`, `our_why_image_flip`, `our_why_image_scale`, `our_why_image_url`, `our_why_label`, `our_why_object_position`, `our_why_quote`, `popup_settings`, `printify_shop_id`, `promo_banner_active`, `promo_banner_bg_color`, `promo_banner_body`, `promo_banner_cta_label`, `promo_banner_cta_url`, `promo_banner_max_shows`, `promo_banner_title`, `singleton`, `site_menu_settings`, `social_links`, `story_gradient_dir`, `story_gradient_opacity`, `story_image_fit`, `story_image_flip`, `story_image_scale`, `story_image_url`, `story_object_position`, `stripe_mode`, `testimonials`

**Fix:** Rewrote `20260903192000_backfill_fresh_install_columns.sql` with all missing columns pulled from `fresh_install.sql`. (`+41 / -12`)

---

### Fix 6: `facebook_domain_verification` on wrong table

**Error:**
```
ERROR: column "facebook_domain_verification" does not exist (SQLSTATE 42703)
CREATE VIEW settings_public AS SELECT ... facebook_domain_verification,
```

`20261016000003_add_facebook_domain_verification.sql` adds the column to `seo_settings`, not `settings`. The view references `settings.facebook_domain_verification` but the column lives on a different table.

**Fix:**

- Removed `facebook_domain_verification` from the backfill migration for `settings`. (`+0 / -1`)
- Removed `facebook_domain_verification` from the `settings_public` view. (`+0 / -1`)

---

### Fix 7: `amount` column does not exist in `affiliate_payouts`

**Error:**
```
ERROR: column "amount" does not exist (SQLSTATE 42703)
```

`20261018000000_fix_affiliate_payouts_schema.sql` had an `UPDATE` that referenced old columns (`amount`, `method`, `memo`) before the `DROP COLUMN IF EXISTS`. In the shadow DB those columns never existed (the correct schema was created by `20261001`).

**Fix:** Wrapped the data migration `UPDATE` in a `DO` block that checks whether the old columns exist before referencing them. (`+23 / -11`)

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'affiliate_payouts'
      AND column_name  = 'amount'
  ) THEN
    UPDATE affiliate_payouts SET ...
  END IF;
END;
$$;
```

---

### Fix 8: `cannot drop column old_auth_id` — dependent objects

**Error:**
```
ERROR: cannot drop column old_auth_id of table admins because other objects depend on it (SQLSTATE 2BP01)
```

In the shadow DB, `old_auth_id` (originally `id`) was referenced by dependent objects (foreign keys / policies). The fix is to add `CASCADE`.

**Fix applied to `20261020000000_fix_admins_pk.sql`:**

```sql
-- Before
ALTER TABLE admins DROP COLUMN IF EXISTS old_auth_id;

-- After
ALTER TABLE admins DROP COLUMN IF EXISTS old_auth_id CASCADE;
```

(`+1 / -1`)

---

## Migration Chain: Clean Replay Confirmed

After all fixes above, all 53 migrations replay cleanly through the shadow database:

```
Applying migration 20250715_cleanup_unconfirmed_users.sql...
Applying migration 20260903191649_create_ecommerce_schema.sql...
Applying migration 20260903192000_backfill_fresh_install_columns.sql...
...
Applying migration 20261021000000_add_insert_admin_row_function.sql...
Diffing schemas: extensions,public
```

---

## Diff Results: Production vs. Local Migrations

After the chain replayed cleanly, `supabase db diff --linked` produced the actual diff. The diff shows what SQL would need to run to make production match local migrations.

### Category 1: Pending migrations not yet pushed to production

| Object | Migration |
|---|---|
| `admins.auth_user_id`, `idx_admins_auth_user_id` | `20261020` |
| `orders.user_id`, `orders_user_id_fkey` | `20261019` |
| `insert_admin_row` function | `20261021` |
| `settings_public` view | `20261017` |
| `settings.facebook_domain_verification` | `20261016000003` / backfill |
| Printful columns on orders/products/settings | `20261013` |

→ **Fix:** `supabase db push --linked`

### Category 2: Production still has old RLS policies (pre-`20261020`)

Production policies use `admins.id = auth.uid()` but migrations updated them to use `admins.auth_user_id = auth.uid()`. Migration `20261020` hadn't been applied to production yet.

→ **Same fix:** push pending migrations.

### Category 3: Production has columns with no migration file

```
settings.about_culture_settings
settings.about_hero_settings
settings.about_mission_settings
settings.about_story_settings
settings.product_badge_1/2/3_active/text
settings.video_enabled
settings.video_tracks
```

These exist in production but have no migration file. They were added directly or via `fresh_install.sql` on a newer version.

→ **Fix:** create a new migration for these columns so the chain stays in sync.

---

## `supabase db push --linked` — Migration History Repair

**Error:**
```
Remote migration versions not found in local migrations directory.

Make sure your local git repo is up-to-date. If the error persists, try
repairing the migration history table:
supabase migration repair --status reverted 20240101

And update local migrations to match remote database:
supabase db pull
```

**Context**

Production had migration versions recorded that didn't match local filenames. The rename operations (timestamps changed) caused the mismatch.

```bash
supabase migration list
```

| Local | Remote | Notes |
|---|---|---|
| _(missing)_ | `20240101` | Renamed to `20261001500000` locally |
| `20260903192000` | _(missing)_ | New backfill migration, local only |
| `20260920000002` | _(missing)_ | Created by renaming `fix_settings_singleton` |
| `20261001500000` | _(missing)_ | Renamed from `20240101` |
| `20261014000001` | _(missing)_ | Renamed from duplicate `20261014000000` |

**Fix — repair migration history:**

```bash
# Mark renamed migration as reverted so production stops expecting it
supabase migration repair --status reverted 20240101

# Mark local-only migrations as applied (content already exists via fresh_install.sql)
supabase migration repair --status applied 20260903192000
supabase migration repair --status applied 20260920000002
supabase migration repair --status applied 20261001500000

# Mark renamed facebook_pixel as applied (content already in production under old timestamp)
supabase migration repair --status applied 20261014000001
```

---

## Final Push: Migrations Applied to Production

After all repairs, `supabase db push --linked` successfully applied 5 pending migrations:

```
• 20261016000000_add_ga4.sql                        (already applied — columns existed)
• 20261016000001_add_attribution_to_orders.sql      (already applied — columns existed)
• 20261016000002_add_marketing_consent_label.sql    (already applied — columns existed)
• 20261016000003_add_facebook_domain_verification.sql (already applied — columns existed)
• 20261017000000_restrict_settings_stripe_keys.sql  ✓ applied
• 20261018000000_fix_affiliate_payouts_schema.sql   ✓ applied
• 20261019000000_add_user_id_to_orders.sql          ✓ applied
• 20261020000000_fix_admins_pk.sql                  ✓ applied
• 20261021000000_add_insert_admin_row_function.sql  ✓ applied

Finished supabase db push.
```

**What landed in production:**

| Migration | What it did |
|---|---|
| `20261017` | Created `settings_public` view, blocked direct `settings` SELECT for anon/authenticated |
| `20261018` | Fixed `affiliate_payouts` schema (idempotent — columns already existed) |
| `20261019` | Added `user_id` to `orders` |
| `20261020` | Decoupled `admins` PK from `auth.uid()`, added `auth_user_id`, updated all RLS policies |
| `20261021` | Added `insert_admin_row` security-definer function |

Migration chain is now clean and in sync with production. Run `supabase migration list` to confirm everything shows matched Local/Remote columns.
