# RLS Policy Map

Full matrix of every table × role × operation. Use this to audit access control and understand the impact of migrations.

---

## Access Matrix

Legend: `✓` = allowed · `✗` = denied · `own` = own row only · `INSERT` = insert-only (no SELECT)

| Table | anon SELECT | anon INSERT | auth SELECT | auth INSERT | auth UPDATE | auth DELETE | admin ALL |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `auth.users` | ✗ | — | own | — | own | — | — |
| `admins` | ✗ | ✗ | own¹ | ✗ | ✗ | ✗ | super_admin² |
| `customer_profiles` | ✗ | ✗ | own | own | own | ✗ | ✓ (read) |
| `categories` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `products` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `orders` | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ |
| `affiliates` | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ |
| `affiliate_clicks` | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ (read) |
| `affiliate_conversions` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `affiliate_payouts` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `settings` | ⚠️³ | ✗ | ⚠️³ | ✗ | ✗ | ✗ | UPDATE only |
| `settings_public` (view) | ✓⁴ | — | ✓⁴ | — | — | — | — |
| `seo_settings` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `policies` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ (no DELETE) |
| `email_events` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

**Notes:**
1. `admins` SELECT: authenticated users can read their own row; super_admin can read all rows
2. `admins` INSERT/DELETE: super_admin only
3. `settings` direct SELECT: **⚠️ GAP-012** — migration `20261017000000` replaces `USING (true)` with `USING (false)`. Pending deploy.
4. `settings_public` view: SECURITY DEFINER view excludes 4 Stripe secret columns. Available after migration deploy.

---

## Policy Definitions Per Table

### admins
```sql
-- SELECT: own row, or super_admin can read all
USING (auth.uid() = id OR EXISTS (
  SELECT 1 FROM admins a WHERE a.id = auth.uid() AND a.role = 'super_admin'
))

-- INSERT: super_admin only
WITH CHECK (EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid() AND a.role = 'super_admin'))

-- DELETE: super_admin only
USING (EXISTS (SELECT 1 FROM admins a WHERE a.id = auth.uid() AND a.role = 'super_admin'))
```

### categories / products
```sql
-- SELECT: public (anon + authenticated)
USING (true)

-- INSERT / UPDATE / DELETE: admin only
EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

### orders
```sql
-- INSERT: public (checkout — no auth required)
WITH CHECK (true)

-- SELECT / UPDATE / DELETE: admin only
EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

### affiliates
```sql
-- INSERT: public (signup — no auth required)
WITH CHECK (true)

-- ALL (SELECT/UPDATE/DELETE): admin only
EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

### affiliate_clicks
```sql
-- INSERT: public (click tracking — no auth required)
WITH CHECK (true)

-- SELECT: admin only
EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

### affiliate_conversions / affiliate_payouts
```sql
-- ALL: admin only
EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

### customer_profiles
```sql
-- SELECT / INSERT / UPDATE: own row only
auth.uid() = id

-- SELECT (admin): admin can read all
EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

### settings — BEFORE migration (current production state)
```sql
-- ⚠️ UNRESTRICTED — exposes Stripe/Resend secrets to anon
SELECT: USING (true)
UPDATE: EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

### settings — AFTER migration 20261017000000 (pending deploy)
```sql
-- Direct table SELECT blocked for anon/authenticated
SELECT: USING (false)
UPDATE: EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())

-- settings_public view (SECURITY DEFINER) — excludes secret columns
-- Grants SELECT to anon, authenticated
```

### seo_settings
```sql
-- ALL: open (no admin check — any authenticated user can update)
-- ⚠️ Note: this is permissive — consider restricting to admins
USING (true) WITH CHECK (true)
```

### policies
```sql
-- SELECT: public
USING (true)

-- INSERT / UPDATE: admin only
EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

### email_events
```sql
-- ALL: admin only
EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
```

---

## Service Role Bypass

All Supabase Edge Functions use `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS entirely. This is intentional — edge functions are server-side trusted code.

```
stripe-checkout   → service_role → orders (INSERT), products (SELECT)
stripe-webhook    → service_role → orders (UPDATE), affiliates (SELECT),
                                   affiliate_conversions (INSERT), settings (SELECT)
printify-proxy    → service_role → products (UPSERT), settings (UPDATE)
printify-webhook  → service_role → products (UPSERT), orders (UPDATE), settings (SELECT/UPDATE)
```

---

## GAP-012 Impact Diagram

```
BEFORE migration (current production):

  anon browser ──► SELECT * FROM settings
                        │
                        ▼
              Returns ALL columns including:
              stripe_live_secret_key      ← sk_live_51...
              stripe_live_webhook_secret  ← whsec_...
              stripe_test_secret_key      ← sk_test_...
              stripe_test_webhook_secret  ← whsec_...
              resend_api_key              ← re_...

  These are serialized into RSC payload HTML on every page load.
  Visible via: curl https://bodyandsleeves.com/ | grep "sk_live_"


AFTER migration (pending deploy):

  anon browser ──► SELECT * FROM settings
                        │
                        ▼
              Returns 0 rows (USING false policy)

  anon browser ──► SELECT * FROM settings_public  (view)
                        │
                        ▼
              Returns all non-secret columns only.
              Stripe/Resend secrets NOT included.

  Admin routes ──► service_role → bypasses RLS → full settings row
  stripe-config.ts reads secrets via service_role — unaffected.
```

---

## Remaining Risk After Migration

Even after the migration is deployed, `src/app/page.tsx` must be fixed:

```typescript
// CURRENT — passes full settings row (including secrets) as RSC prop
const { data: settings } = await supabase.from('settings').select('*')

// REQUIRED — explicit column list, no secret columns
const { data: settings } = await supabase
  .from('settings_public')
  .select('store_name, tagline, hero_title, hero_subtitle, ...')
```

The migration restricts the RLS policy. The `select("*")` fix prevents the RSC serialization exposure. Both are required.
