# Quick Start

Get the afavers frontend running locally in ~5 minutes. This project is
Supabase + React only — no backend server to run.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- A Supabase project (free tier is fine). Note its **Project URL** and **anon key**.

---

## 1. Clone and install

```bash
git clone https://github.com/BamboJude/afavers.git
cd afavers
npm install
```

## 2. Apply the database schema

Open the Supabase SQL editor and run every file under `supabase/migrations/`
in filename order (top to bottom). This creates the `users`, `jobs`,
`user_jobs`, `user_settings`, gamification, and admin tables, plus the RLS
policies and admin RPC functions.

## 3. Configure the frontend

The only template is at the repo root, and it is copied *into* `client/`:

```bash
cp .env.example client/.env
```

Edit `client/.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 4. Run the dev server

```bash
# from the repo root
npm run dev
```

The app opens at `http://localhost:5173`.

## 5. Create your account

Use the in-app **Sign up** form. Supabase Auth creates the `auth.users` row; a
trigger (`handle_new_auth_user`) automatically provisions the matching
`public.users` row and default `user_settings` entries.

To promote yourself to admin, run in the Supabase SQL editor:

```sql
UPDATE public.users SET is_admin = TRUE WHERE email = 'you@example.com';
```

---

## Next steps

- Configure Edge Function secrets and deploy all six functions -- `fetch-jobs`,
  `job-alerts`, `news`, `resend-webhook`, `werkstudent-search` and `export`
  (see `VERCEL_SUPABASE_SETUP.md`). Deploy them only after step 2:
  `werkstudent-search` rethrows if the `consume_search_quota` RPC created by
  `supabase/migrations/20260429_search_quota_rpc.sql` is missing.
- Schedule automated fetching by copying `supabase/manual/schedule_fetch_jobs.example.sql`
  and substituting `YOUR-PROJECT-REF` plus `YOUR_CRON_SECRET`.
- Deploy the client to Vercel — `vercel.json` is already wired for the
  `client/` workspace build.
