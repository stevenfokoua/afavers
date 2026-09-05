# afavers — Code & Product Review

_Date: April 2026 • Branch reviewed: `chore/security-ux-refactor` @ `a704d81`_

Companion doc: [`market-report.md`](./market-report.md) — commercial viability and ICP research.

---

## 1. Executive summary

**Verdict: beta-ready for a free launch; not yet ready to charge money.**

afavers is a more polished codebase than most solo side-projects. Recent commits (`3f71b4e`, `34472d9`, `840a367`) show a deliberate security and accessibility pass — RLS everywhere, CORS allowlist, DOMPurify on untrusted HTML, `focus-visible` rings, `dnd-kit` for keyboard-accessible Kanban, `aria-live` on toasts. The data model is tight, the 22 pages all resolve to real features, and there's zero `TODO`/`FIXME` debt in `client/src`.

What's missing is the invisible infrastructure you only need once real users (and especially paying users) arrive:

| # | Top blockers before paid launch | Severity |
|---|--|--|
| 1 | **No error monitoring** (no Sentry/PostHog/anything). Production failures are silent. | **P0** |
| 2 | **No E2E or component tests.** Two Vitest service files (~670 LOC); the Edge-Function suite is entirely `.skip`'d. A paid-tier regression would ship. | **P0** |
| 3 | **Scraping posture undocumented** — `User-Agent` spoof of the Bundesagentur mobile client (`supabase/functions/_shared/jobs.ts:80`); no recorded legal review of Adzuna/BA API ToS. Blocks any B2B / compliance conversation. | **P0** |

| # | Top strengths | |
|---|--|--|
| 1 | Security work is recent and real — RLS on every user table, CORS allowlist, CSP (report-only), DOMPurify, `sessionStorage` for auth, admin-only `admin_delete_user` RPC. | |
| 2 | Differentiator is **already shipped**: `AnalyticsPage` (`client/src/pages/AnalyticsPage.tsx:170-207`) renders an A4-landscape HTML report explicitly pitched as a "job search proof packet" for appointments. Kanban is commodity; this export is not. | |
| 3 | Code hygiene: clean separation (pages / services / stores / components), modern deps (React 19.2, Vite 7.3, Supabase JS 2.103, TS 5.9), no dead imports, no lingering TODOs. | |

---

## 2. Architecture & data model

**Stack:** React 19 + Vite 7 + TS 5.9 + Tailwind 4 + Zustand 5 on the front end. Supabase (Auth + Postgres + Edge Functions + pg_cron) on the back end. Vercel for hosting. Chrome/Firefox MV3 extension. Capacitor iOS shell (scaffolded only).

**Core entities (from `supabase/migrations/`):**

| Table | Purpose | RLS |
|---|---|---|
| `users` | App profile, `auth_user_id` FK to Supabase Auth, `is_admin` flag | read-own + admin |
| `jobs` | Global pool (scraped + manual + extension) | read-all authenticated |
| `user_jobs` | Per-user tracker row: status, applied/follow-up/interview dates, notes, checklist, history JSON | own-only |
| `user_settings` | Keywords + locations + language + timezone | own-only |
| `job_alerts` | Email-alert rule (keywords, locations, `min_score` 0–100, `instant`/`daily`) | own-only |
| `job_alert_deliveries` | Dedup ledger (`UNIQUE(alert_id, job_id)`) | own-read, `RESTRICTIVE` no-insert for user roles |
| `gamification` (xp_events / achievements / user_stats) | Cosmetic XP | own-only |
| `contact_messages` | Inbound support mail | admin-only |
| `password_reset_tokens` | `RESTRICTIVE deny-all` for `anon`/`authenticated` | fully locked |

**Relationships:** `users 1─n user_jobs n─1 jobs`. Job records are shared, state is private. This is the right shape — no N+1 surprises in the tracker layer.

**Scraped sources:** Bundesagentur für Arbeit + Adzuna via `supabase/functions/fetch-jobs`. Tagesschau via `supabase/functions/news`. Werkstudent-specific BA query via `supabase/functions/werkstudent-search`.

---

## 3. Feature completeness by page

`client/src/pages` contains 22 route components. Grades below are as-wired, not as-marketed.

| Page | Status | Notes |
|---|---|---|
| `LandingPage.tsx` | shipped | Heavy; includes sample jobs (`SAMPLE_JOBS`, line 8) + animated visuals. Public landing is stand-alone. |
| `DashboardPage.tsx` | shipped | Follow-ups + interviews + news carousel. Real data. |
| `JobsPage.tsx` / `EnglishJobsPage.tsx` / `DemoJobsPage.tsx` | shipped | Filtered browsing; English filter via `language` column populated by `detectLanguage()`. |
| `KanbanPage.tsx` | shipped | dnd-kit drag-drop, keyboard-accessible, memoised cards (`bc8ecb2`). |
| `JobDetailPage.tsx` | shipped | DOMPurify-sanitised description. |
| `HotpicksPage.tsx` | thin | Swipe triage works; gamification next to it is cosmetic only (XP/badges never gate features). |
| `AnalyticsPage.tsx` | shipped | Best single page. Real CSV / Excel-as-HTML / PDF-via-print-window export (`:136–207`). "Foreign office ready" framing at `:349`. **This is the commercial moat.** |
| `RemindersPage.tsx` | shipped | Uses browser Notification API + Capacitor local-notifications. |
| `SettingsPage.tsx` | shipped | Job-alert rule editor + feed-keyword presets (`FEED_PRESETS` line 10). Unsaved-changes guard via `useUnsavedChangesGuard`. |
| `SetupPage.tsx` | shipped | First-run onboarding. |
| `NewsPage.tsx` | thin | Proxy to Tagesschau, top-50, no curation or personalisation. |
| `InterviewPrepPage.tsx` | thin | Hard-coded YouTube playlist. |
| `CareerGuidesPage.tsx` | thin | Hard-coded articles, no CMS. |
| `LoginPage` / `RegisterPage` / `ForgotPasswordPage` / `ResetPasswordPage` | shipped | Supabase Auth, email-verified. |
| `AdminPage.tsx` / `AdminLoginPage.tsx` | thin | User list + message inbox; minimal features vs. marketing copy. |
| `DisclaimerPage.tsx` | thin | Doubles as privacy notice. **No separate `/terms`.** |

**Hot take:** Career Guides and Interview Prep are thin enough that they read as filler next to the real product. They should be either (a) dropped, (b) CMS-ified, or (c) collapsed behind a single "Resources" route to avoid cheapening the first-run impression.

---

## 4. Security & compliance

### Done right

- **RLS on every user-touching table.** `job_alerts_own_all`, `user_jobs_own_*`, `password_reset_tokens_deny_all` (RESTRICTIVE). Service-role required for inserts on `job_alert_deliveries` (`20260420_job_email_alerts.sql:54-58`).
- **CORS** allowlist (wildcard subdomains for Vercel previews). Removed from `*` in the security pass.
- **Cron auth is fail-closed** (`supabase/functions/fetch-jobs/index.ts:12-18`): if `CRON_SECRET` is missing or mismatched, 401. No bearer fallback.
- **DOMPurify** sanitising job descriptions before injection into the DOM.
- **Admin self-delete guard** in the SECURITY DEFINER RPC (`supabase/migrations/20260420_review_security_fixes.sql:40-42`).
- **Auth state in `sessionStorage`**, not `localStorage` (`client/src/store/authStore.ts:258`). Token isn't duplicated in Zustand's persisted state (`partialize`, `:262-267`).

### Gaps

| Gap | Where | Fix |
|---|---|---|
| **CSP is report-only**, not enforced. | `vercel.json:21` — `Content-Security-Policy-Report-Only` | Monitor reports for 2 weeks, then flip to `Content-Security-Policy`. |
| **No self-service GDPR export / deletion UI.** | Disclaimer says "contact us"; no endpoint. | Build a `Settings → Data → Export my data + Delete my account` flow. Mandatory before EU-wide marketing; strictly required for paid EU SaaS. |
| **No `/terms` page**; Disclaimer doubles as privacy. | `client/src/pages/DisclaimerPage.tsx` | Paid launch needs a ToS (liability, refunds, jurisdiction). |
| **Scraping posture undocumented.** | `supabase/functions/_shared/jobs.ts:80` spoofs the Bundesagentur iOS client UA. | Publish a `docs/data-sources.md` enumerating each source, its ToS review date, the rate-limit assumption, and the user-facing attribution. |
| **No robots.txt respect** in the extension content script or Edge Functions. | `extension/content.js`, `supabase/functions/_shared/jobs.ts` | Low-urgency for the extension (user-initiated), higher for any automated BA/Adzuna expansion. |
| **Legacy `password_reset_tokens` table still present** (locked `deny-all`). | `supabase/migrations/20260420_review_security_fixes.sql:15-24` | Verify the table is unused and drop it; dead code invites rediscovery. |

---

## 5. Scalability red flags

All reachable from `supabase/functions/_shared/jobs.ts`:

1. **Nested loop, `O(keywords × locations)`** (`:66-105`). With caps of 20 × 12 that's **240 requests per run**, serialised with `sleep(250)` ≈ **~60 seconds of wall-clock per cron fire**. At 2-hour cron cadence this is fine; at hourly or per-user it isn't.
2. **`try { ... } catch {}` swallows all errors** (`:99`). No counter, no alert, no retry. If BA starts 429-ing, the run looks successful but returns zero jobs.
3. **Page 1 only**, `size=35` (`:71-72`). Any keyword/location combo with >35 results silently truncates.
4. **Global `SELECT keywords,locations` across all users** (`:46`) on every cron run. Fine at 100 users; wasteful at 10 000. Cap is applied after the full table scan.
5. **Adzuna config is hard-coded** (`:115-116`) — four German-sustainability keywords, three cities. Not user-driven at all. Either make it user-driven or drop it in favour of extension + BA.
6. **No rate limiting** on `werkstudent-search` (user-triggered, authenticated). An abusive authenticated user can spam the BA API via your project's key.

**None of these break an MVP.** All will bite in the first 1 000 active users.

---

## 6. Observability — the single largest P0

There is **no Sentry, PostHog, Datadog, or anything equivalent** anywhere in the repo. If Supabase's cron silently starts 401-ing, if a browser-extension update breaks LinkedIn capture, if a pay-wall check regresses — nobody finds out until a user emails. This is cheap to fix: a single Sentry browser SDK + Supabase Log Drain to Logtail/Axiom would give near-total coverage for <€20/month. **Do this before the first paid user.**

---

## 7. Testing

| Where | What | Honest coverage |
|---|---|---|
| `client/src/services/**/*.test.ts` | `jobs.service.test.ts` (15 cases), `gamification.service.test.ts` (22 cases) | Smoke tests on service transforms. ~670 LOC of tests, not wired to coverage thresholds. |
| `supabase/functions/_shared/jobs.test.ts` | Partial Deno test file, `commit 0938890 (WIP — partial Deno skip)` | **Entirely skipped** because bare-HTTP `esm.sh` imports don't resolve under Node. |
| Component tests | — | None. |
| E2E (Playwright/Cypress) | — | None. |
| CI gates | `.github/workflows/ci.yml` | tsc, Vitest, Vite build, Deno typecheck. No lint, no audit, no Playwright. |

**Minimum additions before paid launch:**
1. Playwright happy-path: signup → save a job → Kanban move → export PDF → log out. ~1 day of work; catches the regressions that matter to a paying user.
2. Wire ESLint into CI (config exists at `client/eslint.config.js`, only run via `npm run lint`).
3. Add `npm audit --production --audit-level=high` as a CI job (non-blocking at first, blocking after triage).

---

## 8. Dependencies & build

Stack is modern and recent — no flags from a cursory audit:

- React 19.2, React Router 7.13, Zustand 5.0
- Supabase JS 2.103, DOMPurify 3.3, dnd-kit 6.3
- Vite 7.3, TS 5.9, Vitest 4.1
- Capacitor 8.2 (iOS/core only — no Android)

**Rough edges:**
- `client/scripts/ensure-rollup-native.cjs` + `prebuild` hook — legacy workaround for Vercel's prior Rollup native-binary issue. Try removing on a Vercel branch build; if it still works, delete the script and the hook. If not, add a one-line note in `client/scripts/` explaining why it lives.
- Root `package.json:34-40` pins `brace-expansion` via an `overrides` block. Unclear whether this is for a known CVE or a historical artefact — audit and document or remove.
- `@types/dompurify` is a top-level dep instead of a dev dep (`client/package.json:29`). Cosmetic.

---

## 9. UX review (deferred — recommended before paid launch)

I couldn't boot the dev server in this session (no local Supabase creds). Before charging money, walk the flows below with a fresh browser profile and log each observation in this section:

1. **Signup** — is the email-verification wait clearly explained? What happens if the user tries to log in before verifying?
2. **Onboarding (`SetupPage`)** — how fast can a new user reach a first populated Kanban column? Target: under 90 seconds.
3. **Kanban** — drag a card on mobile (touch). Drag a card with keyboard (tab + space).
4. **Analytics export** — generate a PDF; open it; does it look submission-ready for a Jobcenter appointment? Check EN/DE date formatting, footer, column truncation on `Notes`.
5. **Extension** — capture jobs from LinkedIn, StepStone, and XING. Do they land in the tracker with the right dedupe behaviour (same posting captured twice)?
6. **Empty states** — what does `Dashboard` look like with zero applications? Does it guide or shame?
7. **Demo mode** — does `demo@afavers.com / demo1234` reset cleanly on each login? (Code resets in `authStore.ts:112-170`.)
8. **Mobile** — Chrome DevTools at 375×667. Does the sidebar collapse? Are tap targets ≥44 px?
9. **Bilingual parity** — switch DE ↔ EN on every page; are any strings still English-only?

Capture at least one screenshot of the generated PDF for the market-report's differentiation argument.

---

## 10. Prioritised punch list

Each item is linked to a file:line where the fix should land, or where the gap lives.

### P0 — block paid launch

- **Add Sentry browser + Supabase log drain.** New: `client/src/lib/observability.ts`, wire in `client/src/main.tsx`.
- **Enforce CSP** (`vercel.json:21`). Flip after a two-week report-only observation.
- **Ship self-service GDPR export + delete.** New: `Settings → Data` UI + Edge Function that emits a ZIP of `user_jobs`, `user_settings`, `job_alerts` rows scoped via RLS.
- **Publish `docs/data-sources.md`** covering Bundesagentur, Adzuna, extension-captured sites; each with ToS review note and rate-limit assumption.
- **Playwright happy-path test**: signup → save → Kanban → PDF export. Run in CI.
- **Rate-limit `werkstudent-search` per user** (e.g., 30/hr) via a Supabase `rate_limits` table keyed on `user_id`.

### P1 — before monetising

- **Monetisation infra.** Stripe subscription + a `plan` column on `users` + a single `requirePlan('pro')` helper gating PDF export + `job_alerts.frequency='instant'` + Werkstudent search.
- **Pagination on BA/Adzuna fetch** (`supabase/functions/_shared/jobs.ts:71-72`) — walk `page=1..N` until empty or budget is hit.
- **Error-counter on fetch** (`:99-101`) — increment a Supabase row on each `catch`, alert above threshold.
- **Terms of Service page** plus a consent record (timestamp the signup consent).
- **Remove `SAMPLE_JOBS`** (`client/src/pages/LandingPage.tsx:8-14`) from the live landing once there's enough real German-language supply.
- **Supabase Functions test harness** — extract pure logic into `_shared/jobs.pure.ts` so Vitest can import it; keep `esm.sh` imports only in the `Deno.serve` entry file.

### P2 — polish / post-revenue

- **Replace static Career Guides + Interview Prep** with either a thin CMS (Notion-as-CMS / MDX in repo) or drop them.
- **iOS Capacitor** — decide: commit to App Store submission or remove `client/ios/`. Half-scaffolded is worst-of-both.
- **Admin panel depth** — at minimum, plan-tier overview and a "delete all my data" action that mirrors the user flow.
- **Bundle split on heavy routes** (Analytics, Kanban, GermanyJobMap / Leaflet). Leaflet alone is ~40 KB gzipped.
- **Deprecate `password_reset_tokens`** if confirmed unused.
- **Remove Vercel Rollup workaround** after confirming fresh Vercel builds don't need it.
- **Gamification** — either wire XP/badges to something functional (Pro trial days for streaks?) or retire the UI.

---

## Appendix — cross-reference with `market-report.md`

- **Observability + Stripe (P0/P1)** are prerequisites for the "B2C freemium" and "Chancenkarte niche" scenarios.
- **Terms of Service + data-export Edge Function + docs/data-sources.md (P0/P1)** are prerequisites for the "B2B pivot" scenario; enterprise buyers will ask for all three in a security questionnaire.
- **Playwright happy-path (P0)** is prerequisite for any paid tier regardless of scenario — support load scales with price.
- The **export is the moat** (`AnalyticsPage.tsx:170-207`). Any GTM conversation starts there; any code cleanup here should protect that flow first.
