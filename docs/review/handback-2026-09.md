# Hand-back — September 2026

Everything on `chore/security-ux-refactor` that was not yet on `main`, finished and made safe to merge, then merged with `upstream/main` so it lands clean. The branch had been sitting 252 commits ahead of the deployed site since April, with the newest and most dangerous code untracked in a working directory.

## Security

**`resend-webhook` had no authentication at all.** Sixteen lines that took any POST body and wrote to `email_suppressions` with the service-role client. Anyone who knew the URL could permanently suppress mail to any address — an unauthenticated, targeted, persistent denial of service against individual users, on a product whose value proposition includes job-alert email.

It now verifies the Svix signature before touching the database. The check is done by hand with Web Crypto rather than pulling in the `svix` package: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`, keyed on the base64 payload of `RESEND_WEBHOOK_SECRET`, compared in constant time against each `v1,<sig>` entry in the `svix-signature` header. A missing secret **rejects** rather than waving requests through, timestamps outside a five-minute window are refused so an old capture cannot be replayed, and anything that fails returns 401 before a single query runs.

Two smaller defects in the same file went with it: `req.json()` was unguarded, so a malformed body threw out of the handler and returned a bare 500 (it returns 400 now), and the `upsert` had no `onConflict`, so the second bounce for an address would error against the `email` primary key.

**This needs `RESEND_WEBHOOK_SECRET` in the function's environment.** Copy it from the Resend dashboard's webhook settings. Without it the endpoint rejects everything, which is the correct failure direction but does mean bounces stop being recorded until it is set.

**`email_suppressions` had no row-level security.** Supabase grants `anon` and `authenticated` full privileges on `public` by default and PostgREST exposes every such table, so the table was world-readable and world-writable with the public anon key. Its contents are the email address of every user who has bounced or filed a spam complaint — enumerable userbase PII on the read side, and free suppression of anyone on the write side. It now has `ENABLE ROW LEVEL SECURITY`, a restrictive deny-all policy for `anon` and `authenticated`, and an explicit `REVOKE`, matching the pattern already used for `search_quota` and `activity_log`. The service-role client bypasses RLS, so the webhook still writes.

This was the only table in the schema missing RLS. Every other one was already covered.

**`current_app_user_id()` keyed off a user-mutable claim.** `20260415_tracker_private_manual_jobs.sql` redefined it to look up `public.users` by `auth.jwt() ->> 'email'`, which makes every row-level security decision in the database turn on a value users can change. The fix, `20260429_fix_current_app_user_id.sql`, reverts it to `auth_user_id = auth.uid()`. It was written in April and left untracked; it is committed now. That matters because the deployment docs tell you to apply migrations in filename order, so before this commit, following them landed a fresh database on the vulnerable April definition.

**CSP.** The root `vercel.json` promotes the policy from `Content-Security-Policy-Report-Only` to enforcing. The `report-uri /csp-report` directive is dropped, because no such endpoint exists in this repo and the reports went nowhere. The new `client/vercel.json` from upstream carried no CSP at all, so if Vercel ever builds with `client/` as the root directory the header would silently vanish; both files now carry the identical policy.

**Smaller ones.** `export` threw on a failed profile lookup, which escapes `Deno.serve` and returns a 500 with no CORS headers, so the browser reported a CORS error instead of the real one. It returns 404 now. The extension's content script ignored the `sender` argument, so any page reaching the listener could drive it — not exploitable today without `externally_connectable`, but the guard is one line.

## Deploy order — this part is not optional

1. **Apply the eight `supabase/migrations/20260429_*.sql` files in the Supabase SQL editor**, plus Jude's `20260706_soft_delete_stale_jobs.sql`.
2. **Then deploy the Edge Functions** with `supabase functions deploy`. All six, not the three the docs used to list.
3. **Then let Vercel build `main`.**

`werkstudent-search` calls `consume_search_quota` and rethrows on error, so deploying the functions before the migrations makes every Werkstudent search return 500. (`get_search_config`, the other new RPC, falls back to defaults on error and is safe either way, so `consume_search_quota` is the one that forces the ordering.) The migrations are additive and idempotent — `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, and policy creation guarded by a `pg_policies` lookup — so applying them before the functions ship breaks nothing.

## Bug fixes

**Export dates were a day early for every user west of UTC.** `formatDate` ran DATE-only column values through `new Date()`. Per ECMA-262 a date-only ISO string parses as UTC midnight, and `toLocaleDateString` then renders it in the browser's timezone, so `applied_date`, `follow_up_date`, `interview_date` and `deadline` all came out a day early — in the CSV, in the Excel file, in the print-to-PDF report, and in the on-screen analytics table. The document is handed to the Ausländerbehörde as proof of when a job search happened, so wrong dates on it are the one failure this feature cannot have. DATE-only strings are now reformatted as text and never touch `Date`. Real timestamps still resolve to the viewer's local calendar day.

**CSV formula injection.** `escapeCsv` quoted correctly but never neutralised formula evaluation. Job titles and companies are scraped from third-party job boards and notes are free text, so a cell starting with `=`, `+`, `-` or `@` executed on open in the caseworker's spreadsheet. It now prefixes a single quote.

**The export date filter disagreed with the display.** It sliced the raw UTC date while the table showed the local one, so a boundary row could display one day and filter as another, silently entering or leaving the official report. Both now derive from the same key.

**Downloads could be cancelled.** `downloadBlob` revoked the object URL synchronously after `click()`, which can kill the download before it starts — Firefox most often, and more often the larger the file, which correlates with the users who have the most to export. It revokes on the next tick.

**The print window printed on a timer.** A fixed 250 ms guess that a long report can outrun, producing a blank or partial page, and the export spinner cleared before the dialog appeared. It prints on `onload`.

These helpers moved to `client/src/utils/exportFormat.ts`, because `jobsService.exportCsv` had its own copy of the CSV escape with the same injection hole and its own copy of the download helper. Both call sites now share one implementation, covered by `client/src/utils/exportFormat.test.ts` — 14 assertions, including the timezone cases that would have caught the date bug outright.

**The extension destroyed job history.** `popup.src.js` upserted `user_jobs` with literal `checklist` and `history` values on `onConflict 'user_id,job_id'`. Both are JSONB columns, so the upsert replaced them wholesale: capturing a job you had already been tracking for weeks replaced the entire application timeline and checklist with two synthetic events. Silent, unrecoverable, and it destroyed exactly the data the proof-of-search export is built from. It now reads the existing overlay first and merges — the checklist keeps every entry, history appends, a status event is recorded only when the status actually changed, and an `applied_date` that was already set is never cleared.

**Eight silent failures on user actions.** Save, Apply, Prepare, Unsave, Revert and Hide on a job, plus both Hot Picks swipe paths, caught their errors into an empty block. The user got the optimistic UI update and no indication when the write never reached the server. All of them now log and show an error toast through the existing `toastStore`. This took eslint's `no-empty` count from 17 to 5.

## Cleanup

- **Deleted** `client/src/pages/EnglishJobsPage.tsx` (302 lines imported by nothing; `App.tsx` redirects `/english-jobs` to `/jobs?language=en`) and `extension/Archive.zip`. The empty `server/` directory was already gone.
- **Kept** `extension/popup.bundle.js` tracked. `popup.html` loads it directly and `build.js` says outright that it is committed so the extension loads unpacked without an `npm install`, so gitignoring it would break that. It is rebuilt in this branch. The rebuild moved `@supabase/supabase-js` from 2.103.3 to 2.115.0 because the extension had no lockfile, so the lockfile is committed now and the bundle is reproducible.
- **QUICKSTART.md** said Node 18 (it is 22), told you to copy a `client/.env.example` that does not exist (the only template is at the repo root), and listed three of the six Edge Functions.
- **DEPLOYMENT.md** was a stub restating `VERCEL_SUPABASE_SETUP.md`; it is now the pointer it should have been, and the deploy steps moved into the README where they say which branch Vercel builds and that migrations go first. The README's function list also covered four of six and did not say which need `--no-verify-jwt`.
- **CI** pinned `node-version: 20` while `package.json`, `.nvmrc` and `.node-version` all say 22, so it was not testing the runtime Vercel builds on. The Deno type-check covered three functions, so nothing type-checked the webhook, the alert sender or the data export; all six are checked now. Added a `typecheck` script to `client` and `typecheck`/`test` passthroughs at the root so what CI runs has a name and cannot silently drift.
- **Dependencies**: `@capacitor/cli` moved to `devDependencies` (it is iOS build tooling, not a runtime dependency of the web app), and `@types/dompurify` removed since dompurify 3.3.3 ships its own types and the stub shadowed them.

## Merge with upstream

`upstream/main` had moved on by 15 commits — German language support, the Hot Picks restyle, cache recovery controls, the admin manual job fetch, settings and search filter fixes, and a rework of the fetch pipeline. Merged, with Jude's behaviour kept wherever the two disagreed:

- `supabase/functions/_shared/jobs.ts` and `fetch-jobs/index.ts` took his side wholesale. His rework supersedes ours: the source fetchers return `{jobs, complete}` and no longer throw, so his `Promise.all` is safe where ours needed `allSettled`, and he added per-source time budgets and stale-job cleanup we did not have. The `get_search_config` RPC survives on his side of `getSearchConfig`.
- `DashboardPage.tsx` and `jobs.service.ts` conflicts were pure additions on his side, taken as is. The manual fetch card needed `IconRefresh` and `isDemo`, which his DashboardPage has and ours did not, so both were added.
- `HotpicksPage.tsx` kept both sides — his restyle plus our `toastStore` import for the swipe error toasts.

The branch is now 0 behind `upstream/main`.

## Verified locally

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc -b --noEmit`) | passes |
| `npm test` (vitest) | 56 passed, 3 files |
| `npm run build` (vite production) | passes |
| `npx eslint .` | 20 errors, 10 warnings |

Lint is not green and was not green before this branch either — it was 42 errors when this work started. What remains is pre-existing: 5 `react-hooks/set-state-in-effect`, 5 `no-empty` (the Capacitor splash-screen and theme calls, where failing silently is correct), 4 `no-explicit-any`, and a handful of one-offs. CI does not run lint, so none of it was ever blocking. Cleaning it up is a separate job.

## Not verified locally

- **The Svix signature check has never seen a real Resend payload.** The HMAC construction follows the documented scheme, but it is worth firing one test webhook from the Resend dashboard and confirming a 200 before trusting that bounces are still being recorded.
- **No Deno.** The Edge Functions were not type-checked or run; `deno` is not installed here. CI will check all six on this PR, which is the first time it will have checked the webhook at all.
- **No Supabase instance.** No migration was applied or executed anywhere. The SQL is reviewed, not run. Nothing was pushed to any database and no function was deployed.
- **Whether `resend-webhook` is already deployed.** If `supabase functions deploy` was run on 2026-04-29, the unauthenticated version is live right now and stays live until it is redeployed with this code. Worth checking first.
- **Which `current_app_user_id()` the production database currently has.** Given filename ordering it is most likely still the April email-based one. Applying `20260429_fix_current_app_user_id.sql` settles it either way.
- **The extension was not loaded in a browser.** The bundle rebuilds and parses, but the merge behaviour of the capture path was not exercised against a real `user_jobs` row.
- **Print-to-PDF was not exercised.** The `onload` trigger is the correct signal but was not watched in a browser.

## Known limitation left in place

The extension's history merge is read-then-write, so two captures of the same job at the same instant can still lose an event. Closing it properly needs a `SECURITY DEFINER` RPC appending with `history = history || $1::jsonb`, which would also fix the same race in `client/src/services/jobs.service.ts` where two tabs or two fast status changes can drop an entry. That is marked in `popup.src.js`. It was left out here because it would break capture for existing users until the migration was applied, and this change does not.
