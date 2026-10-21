Full code analysis: Body & Sleeves POD storefront
I didn't modify, create or write any code. Six reviewers each covered one area (security, payments/orders, database, frontend, affiliates/email/marketing, tooling/tests/deploy). I re-checked the most serious claims against the code myself; those are marked ✓.

First, a correction. Earlier I said no secrets were committed. That was wrong. My check only covered .env* files.

Bottom line
Most of the application code is reasonably built: strict TypeScript with 0 errors, prices calculated on the server, and a correctly verified Stripe webhook. The serious problems are in three places:

Database permissions: Supabase security rules (RLS) and grants.
Edge functions: two of the four have little or no access control.
Two database build paths that have drifted apart. Building from the migrations and building from fresh_install.sql give different databases. Both are broken, in different ways.
Several findings mean real money or account takeover. Several others mean features silently do nothing.

I did not connect to your database. How serious some items are depends on which path production was built from, so they need checking against the live database.

1. Act now: security
Secrets are committed to git ✓ (the repo is private, which limits exposure).
.notes/chat01 contains a Supabase service_role key, which bypasses all database security, and 3 webhook secrets.
ecosystem.config.js contains a Stripe sk_test_ key and a whsec_ secret, and they are in git history too.
Rotate all of them.
Anyone can use printify-proxy ✓.
printify-proxy/index.ts has no admin check, and the public anon key passes verify_jwt.
Anyone can create Printify orders billed to you, delete products, read customers' addresses, or run /sync and /cleanup, which deletes product rows.
Any signed-in customer can probably make themselves super_admin ✓.
insert_admin_row is SECURITY DEFINER and doesn't check who calls it.
Its only protection is REVOKE … FROM PUBLIC, but Supabase grants EXECUTE directly to anon and authenticated, and that revoke doesn't remove those grants.
Stored XSS that reaches /admin ✓ (on databases built from the migrations).
The seo_settings policy is FOR ALL USING (true) (migration:20), so anyone can write to it.
The pixel and GA IDs are pasted unescaped into inline scripts (FacebookPixel.tsx:45, GoogleAnalytics.tsx:24).
The CSP allows unsafe-inline, so it won't stop this.
Stripe secret keys are readable by anyone ✓ (on databases built from fresh_install.sql). fresh_install.sql:348 gives the anon key USING (true) read access to the settings table, which holds the live Stripe secret and webhook keys.
Affiliate accounts can be taken over ✓.
The pending cookie contains the one-time login code in plain text (verify/route.ts:31).
Anyone with a public referral code can log in as that affiliate and see their email, payout handle and earnings. There is also no limit on attempts.
The Printify webhook isn't verified. Forged events can send store-branded "shipped" emails with phishing links, and can cancel orders.
Open anon INSERT policies ✓.
Anyone can insert into affiliates, including a self-approved affiliate with any commission rate (for example 500%).
Anyone can insert into orders, including fake orders marked "paid".
Smaller security issues:
MailerLite: add_subscriber needs no login and returns MailerLite's raw subscriber data.
Account deletion: a regular admin can delete the super_admin's account ✓ (customers/route.ts:110).
Store wipe: any admin role can run the full store wipe.
Checkout redirect: the success and cancel URLs come from the request body, which allows an open redirect.
Rate limits: they key on a client-controlled X-Forwarded-For value, so they're easy to bypass.
Uploads: the upload route trusts the client's MIME type and accepts SVG.
2. Features that are broken right now
Admin settings saves silently do nothing ✓.
The settings SELECT policy is USING(false). Browser .update().eq("id") therefore matches 0 rows and returns no error.
Affected: Settings sections, About, Announcements, the pause toggle, shipping.
The debug logging in AboutHero suggests someone is already chasing this.
The admins key migration quietly dropped security rules ✓.
DROP COLUMN … CASCADE in fix_admins_pk.sql:25 removed the admin policies on categories, policies, email_events, the affiliate tables and customer_profiles. They were never recreated.
is_admin() and two routes (affiliates:18, payouts:17) still compare admins.id, so all of affiliate admin returns 401.
Customers can't see their own orders ✓. Only admins have a SELECT policy on orders. The success page, account order history and the Purchase pixel/GA events therefore never work.
The music, video and favicon routes return nothing. They read the locked settings table with the anon key.
Saving Branding wipes the music tracks, or fails on the video_* columns, unless the untracked APPLY-NOW SQL has been applied.
On databases built from fresh_install.sql:
No admin can log in (the policy at fresh_install.sql:24 uses id).
The settings_public view is missing, and many columns are missing (discounts, shipments, resend key, music, insert_admin_row).
3. Orders and payments
Large carts are charged but never fulfilled ✓.
Cart items are stored in Stripe metadata via JSON.stringify(...).slice(0, 500) (stripe-checkout:309).
About 7 or more lines produce broken JSON, the parse fails silently, and nothing is sent to Printify. Personalization text is also cut to 50 characters.
A failed Printify submission is ignored. There's no log, no flag and no way for an admin to resubmit, so the order stays "paid" forever.
The Stripe webhook doesn't deduplicate. A Stripe retry repeats the commission, the emails and possibly the Printify order.
Test and live modes mix.
No livemode check, so a test-card payment creates a real Printify order.
"Save & Activate" in stripe-setup doesn't push the edge-function secrets.
When the webhook is recreated, the new secret is saved only in the database.
Orders ship to the wrong address.
Orders go to the address on the checkout form, not the one the customer enters on Stripe.
That form is pre-filled with the sample address "1234 Market Street, Chicago" for profiles with no saved address.
Guest tracking always fails.
The order number in the email (the session-id suffix) doesn't match what tracking looks up (the order-id suffix).
The email lookup is case-sensitive.
Smaller order problems:
Cancel order never works ✓ (route order at printify-proxy:164 vs :188).
Free shipping over $75 is advertised but never applied.
Commission is paid on the pre-discount subtotal, and refunds don't void it.
A double-submitted payout pays twice.
orders.user_id is never set.
The refund email falls back to RESEND_API_KEY as the From address.
4. Database
Duplicate migration version: 20261016000000 is used twice, and a migration that had already been applied was edited afterwards.
APPLY-NOW-…sql is unsafe to re-run.
Each run regenerates every admins.id.
The Supabase CLI ignores it, so a later db push will fail.
It leaves out the 20261018 constraints and all of 20261021.
The singleton fix keeps the least recently edited settings row.
Store-specific destructive migrations ship in the template: 20260913 deletes 61 hard-coded products, and 20260914 sets all products to draft.
Missing constraints:
No unique constraint on orders.stripe_session_id or affiliate_conversions.order_id.
No storage buckets or policies in the migrations.
5. Frontend
Cart: it is emptied before the redirect to Stripe. Removing one personalized line removes every line with the same variant.
Placeholder products: when a query returns nothing, they show $4,200.00 (prices in cents passed to a dollar formatter) and link to pages that 404 ✓.
Caching: a no-store fetch in the root layout makes every route dynamic. revalidate = 60 has no effect, and each page view runs 8–12 Supabase queries.
Double counting: AffiliateTracker is mounted twice ✓, so every referral visit logs 2 clicks.
Products leak: draft products can be viewed and bought, and the wholesale cost is sent to the browser.
Dashboard: revenue is summed client-side and is wrong above 1,000 orders.
Saves that don't stick: saves never check that a row actually changed. The four About sections overwrite each other.
New, uncommitted auth UI doesn't work:
sessionExpired can never become true.
The sign-out branch can't be reached.
The lockout lives only in the browser's sessionStorage.
Cleanup items:
Debug console.logs left in.
Hard-coded "Body & Sleeves" in a template.
Accessibility gaps (labels not linked, no aria-labels, no dialog focus handling).
Tailwind classes that don't exist.
Dead code: About.tsx, env-utils.ts.
6. Tooling, tests and deploy
Type checking: tsc finds 0 errors and lint finds 1 warning. However, supabase/, e2e/ and scripts/ are excluded from type checking, which leaves out all the payment edge-function code.
React types: @types/react is v18 while React is 19.
The tests run against production. .env.local points at the production project. They flip Stripe modes, pause the store and subscribe fake emails, often with no restore step if a test fails.
Test setup and coverage:
global-setup.ts isn't wired into playwright.config.ts.
Nothing tests payments, webhooks or tracking.
There is no CI.
The "zero-downtime" deploy actually rebuilds on the server. build-and-push.sh passes --skip-sync, but deploy.sh only recognises --skip-build, so the server still does a full rebuild on the 2 GB droplet.
No rollback: deploy.sh stops PM2 before building, so a failed build leaves the site down.
Repo hygiene:
A 39 MB supabase-go binary is tracked.
.gitignore: your new e2e line will silently exclude new spec files. Use e2e/.auth/ instead.
docs/governance/ isn't in git at all.
7. Docs that don't match the code
KNOWN-GAPS marks GAP-001, 002, 005 and 012 as resolved; the code shows they aren't.
RELEASE-READINESS says there are no secrets in git history, which is false.
GAP-029 to GAP-041 are fixed only in uncommitted changes. A deploy from git would ship none of them.
AFFILIATE_SESSION_SECRET is required but not documented anywhere.
What's solid
Prices are recalculated from the database on the server.
The Stripe signature check is correct.
The affiliate session cookie uses a timing-safe HMAC.
Login codes come from crypto.randomInt.
No secrets are in NEXT_PUBLIC_* variables, and settings_public excludes them.
Currency handling is correct.
TypeScript is strict with 0 errors.
Suggested order
Rotate the service_role key, the Stripe key and the webhook secrets. Remove the two files and purge them from history.
Close the open doors: require an admin JWT in printify-proxy, revoke insert_admin_row from anon and authenticated, drop the seo_settings admins_all policy and escape the pixel IDs, stop putting the login code in the affiliate cookie, verify Printify webhook requests, and drop the anon INSERT policies.
Check the production database's actual state, then settle on a single install path.
Restore admin writes and the dropped policies, and add a SELECT policy so customers can read their own orders.
Fix the order pipeline: the metadata cut-off, Printify failure handling, webhook deduplication, the livemode check and the shipping address.
Point the tests at a non-production project.
If you'd like, I can write the read-only SQL queries for step 3 so you can run them in the Supabase SQL editor. They would show which of these problems are live in production.