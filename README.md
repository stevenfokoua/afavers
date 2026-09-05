# afavers

afavers is a personal job search tracker for people applying for work in Germany.

It started as a very practical problem: job hunting creates too much scattered information. Links are saved in one place, notes in another, applications in a spreadsheet, follow-ups in your head, and then someone asks for proof of your job search and you have to rebuild the story manually.

afavers keeps that story in one place.

Live app: [afavers.online](https://afavers.online)

## What It Does

- Finds new jobs from German job sources and stores them in Supabase
- Lets users save, reject, prepare, apply, follow up, interview, archive, and track offers
- Turns the job search into a Kanban-style application board
- Saves manually captured jobs from LinkedIn, company pages, StepStone, Indeed, and other sites through the browser extension
- Keeps notes, checklist items, follow-up dates, interview dates, and application history per user
- Exports job search reports as PDF, Excel, or CSV
- Includes a report mode for job-search proof, useful when preparing documents for appointments such as the foreign office
- Supports English and German UI
- Includes admin tools for users, messages, and platform stats

## Why I Built It

I wanted something more useful than another job board.

The core idea is simple: people already use spreadsheets to track applications. afavers should replace that spreadsheet, not add more work. A user should be able to search, save, apply, follow up, and later export a clean record without rebuilding everything from memory.

It is especially shaped around the reality of searching in Germany as an international applicant: lots of portals, language filtering, paperwork, proof of effort, and the need to stay organized over several weeks or months.

## Main Features

**Application Tracker**

Track jobs through saved, preparing, applied, follow-up, interviewing, offered, rejected, and archived stages.

**Reports And Exports**

Export the tracker as PDF, Excel, or CSV. The report includes job title, company, location, status, application date, follow-up date, interview date, notes, checklist, timeline, and job URL.

**Browser Extension**

Save jobs from external job boards directly into your tracker.

**Hot Picks**

Swipe-style triage for quickly saving or rejecting jobs.

**Dashboard**

See what needs attention today: follow-ups, interviews, active applications, and new jobs.

**Supabase Backend**

Supabase handles auth, Postgres data, row-level security, Edge Functions, and scheduled job fetching.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| State | Zustand |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| Backend tasks | Supabase Edge Functions |
| Scheduling | Supabase Cron |
| Hosting | Vercel |
| Extension | Chrome and Firefox browser extension |
| Mobile shell | Capacitor iOS project |

## Repository Structure

```text
afavers/
├── client/                 # React web app
│   ├── src/                # Pages, stores, services, components
│   ├── public/             # Static assets and extension download
│   └── ios/                # Capacitor iOS project
├── extension/              # Browser extension source
├── supabase/
│   ├── functions/          # Edge functions for jobs, news, werkstudent search
│   └── migrations/         # SQL migrations used in Supabase
├── package.json            # Root workspace scripts
└── vercel.json             # Vercel build config
```

## Running Locally

Install dependencies:

```bash
npm install
```

Create `client/.env`:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Start the app:

```bash
npm run dev
```

Build it:

```bash
npm run build
```

## Supabase Setup

The app expects these pieces in Supabase:

- Auth enabled
- Public tables for users, jobs, user job tracking, settings, and contact messages
- Row-level security policies
- Edge Functions in `supabase/functions`
- Scheduled job fetch migration in `supabase/migrations`

Useful files:

- `supabase/migrations/20260415_tracker_private_manual_jobs.sql`
- `supabase/migrations/20260415_admin_rpc.sql`
- `supabase/migrations/20260414_schedule_fetch_jobs.sql`
- `supabase/migrations/20260420_job_email_alerts.sql`
- `supabase/migrations/20260420_schedule_job_alerts.sql`
- `supabase/README.md`

Deploy Edge Functions with the Supabase CLI after linking your project:

Apply the migrations **before** deploying the functions. `werkstudent-search`
calls the `consume_search_quota` RPC and rethrows if it is missing, so a
function deployed ahead of its migration returns 500 on every search.

```bash
npx supabase functions deploy fetch-jobs --project-ref your-project-ref --no-verify-jwt
npx supabase functions deploy job-alerts --project-ref your-project-ref --no-verify-jwt
npx supabase functions deploy news --project-ref your-project-ref --no-verify-jwt
npx supabase functions deploy resend-webhook --project-ref your-project-ref --no-verify-jwt
npx supabase functions deploy werkstudent-search --project-ref your-project-ref
npx supabase functions deploy export --project-ref your-project-ref
```

`fetch-jobs` and `job-alerts` authenticate with `CRON_SECRET`, and
`resend-webhook` verifies the Svix signature against `RESEND_WEBHOOK_SECRET`,
so all three use `--no-verify-jwt`. `werkstudent-search` and `export`
authenticate the caller's JWT and must not.

## Browser Extension

The extension source lives in `extension/`.

The Chrome download used by the landing page is served from:

```text
client/public/afavers-chrome-extension.zip
```

Firefox is distributed through Mozilla Add-ons.

## Deployment

The web app deploys from GitHub to Vercel. Vercel builds the repository's
default branch, `main`.

Run the steps in this order:

1. Apply every SQL file under `supabase/migrations/` in filename order, via the
   Supabase SQL editor.
2. Deploy the Edge Functions in `supabase/functions/` (see the commands above).
3. Push to `main` and let Vercel build.
4. Configure the `pg_cron` schedule from
   `supabase/manual/schedule_fetch_jobs.example.sql`, replacing the project ref
   and cron secret placeholders.

Vercel uses:

```text
Build command: npm run build --workspace=client
Output directory: client/dist
```

Required Vercel environment variables:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Notes

This repository used to include an Express/Railway backend. That has been removed because the live app now uses Supabase directly.

The goal is to keep the project small enough to understand, but useful enough that someone can actually run their job search from it.

## License

MIT
