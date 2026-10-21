# Cron — Ghost Account Cleanup

## What it is
A `pg_cron` job that auto-deletes unconfirmed auth users older than 24 hours.
Unconfirmed = signed up but never clicked the email confirmation link.

## Why it exists
Prevents ghost accounts from accumulating in `auth.users` over time.

## Current status
**Not running.** `pg_cron` is not enabled on the Supabase project (`bdazupyepobieyjzuamf`).
The migration `20250715_cleanup_unconfirmed_users.sql` was marked as applied in migration history
but the cron job itself was never registered because the extension was missing.

## Is this a problem?
For this storefront — **no**. Customers checkout as guests and don't create accounts.
The only auth users are admins. Ghost accounts are not a real concern.

## How to enable it (if needed)

### Step 1 — Enable pg_cron extension
Go to:
`https://supabase.com/dashboard/project/bdazupyepobieyjzuamf/database/extensions`
Search for `pg_cron` → toggle it on.

### Step 2 — Register the cron job
Run this in the Supabase SQL editor:
```sql
select cron.schedule(
  'delete-unconfirmed-users',
  '0 * * * *',
  $$
    delete from auth.users
    where email_confirmed_at is null
      and created_at < now() - interval '24 hours';
  $$
);
```

### Step 3 — Verify it registered
```sql
select * from cron.job;
```
Should show a row with `jobname = 'delete-unconfirmed-users'`.

## How to disable it (if already running)
```sql
select cron.unschedule('delete-unconfirmed-users');
```

## Migration file
`supabase/migrations/20250715_cleanup_unconfirmed_users.sql`
Currently commented out to prevent `db push` errors.
