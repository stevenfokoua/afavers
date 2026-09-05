# Hand-back — September 2026

Everything on `chore/security-ux-refactor` that was not yet on `main`, finished and made safe to merge. The branch had been sitting 252 commits ahead of the deployed site since April, with the newest and most dangerous code untracked in a working directory.

## Deploy order — this part is not optional

1. **Apply the eight `supabase/migrations/20260429_*.sql` files in the Supabase SQL editor.**
2. **Then** `supabase functions deploy` for the six functions.
3. **Then** let Vercel build `main`.

`werkstudent-search/index.ts` calls `consume_search_quota` and rethrows on error, so deploying the functions before the migrations makes every Werkstudent search return 500. (`get_search_config`, the other new RPC, falls back to defaults on error and is safe either way.) The migrations are additive and idempotent — `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, and policy creation guarded by a `pg_policies` lookup — so applying them before the functions ship breaks nothing.

## Security

**`resend-webhook` had no authentication at all.** Sixteen lines that took any POST body and wrote to `email_suppressions` with the service-role client. Anyone who knew the URL could permanently suppress mail to any address — an unauthenticated, targeted, persistent denial of service against individual users, on a product whose value proposition includes job-alert email.

It now verifies the Svix signature before touching the database. The check is done by hand with Web Crypto rather than pulling in the `svix` package: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`, keyed on the base64 payload of `RESEND_WEBHOOK_SECRET`, compared in constant time against each `v1,<sig>` entry in the `svix-signature` header. A missing secret **rejects** rather than waving requests through, timestamps outside a five-minute window are refused so an old capture cannot be replayed, and anything that fails returns 401 before a single query runs.

Two smaller defects in the same file went with it: `req.json()` was unguarded (a malformed body threw out of the handler and returned a bare 500 — it now returns 400), and the `upsert` had no `onConflict`, so the second bounce for an address would error against the `email` primary key.

**Requires `RESEND_WEBHOOK_SECRET` in the function's environment.** Copy it from the Resend dashboard's webhook settings. Without it the endpoint rejects everything, which is the correct failure direction but does mean bounces stop being recorded until it is set.

**`email_suppressions` had no row-level security.** Supabase grants `anon` and `authenticated` full privileges on `public` by default and PostgREST exposes every such table, so the table was world-readable and world-writable with the public anon key. Its contents are the email address of every user who has bounced or filed a spam complaint — enumerable userbase PII on the read side, and free suppression of anyone on the write side. It now has `ENABLE ROW LEVEL SECURITY`, a restrictive deny-all policy for `anon` and `authenticated`, and an explicit `REVOKE`, matching the pattern already used for `search_quota` and `activity_log`. The service-role client bypasses RLS, so the webhook still writes.

This was the only table in the schema missing RLS; every other one was already covered.

**`current_app_user_id()` keyed off a user-mutable claim.** `20260415_tracker_private_manual_jobs.sql` had redefined it to look up `public.users` by `auth.jwt() ->> 'email'`, which makes every RLS decision in the database turn on a value users can change. The untracked `20260429_fix_current_app_user_id.sql` reverts it to `auth_user_id = auth.uid()`. That file is now committed, which matters because the deployment docs tell you to apply migrations in filename order — before this commit, following them landed a fresh database on the vulnerable April definition.

**`export` returned a 500 with no CORS headers** when the profile lookup failed, so the browser reported a CORS error instead of the real one. It returns a proper 404 now.
