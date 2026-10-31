# Real-backend release regression

The CI browser gate builds the app and runs pinned Playwright 1.64.1 against a real disposable Postgres, GoTrue and PostgREST backend. Chromium desktop and WebKit phone projects run serially. Tests do not replace successful backend responses with frontend mocks.

It covers lexical job search, manual application creation, saved notes/checklist/status/settings, agenda navigation, Hot Picks save/undo, phone filters and return focus, signup confirmation/password recovery through a local SMTP capture, reminders/saved-search/calendar synchronization between independent browser contexts, and the database's saved-search quota under concurrent creation.

External feed workers and scheduled reminder/job-alert delivery have separate pure-worker and live release checks. This backend explicitly returns 503 for function endpoints rather than pretending a worker succeeded. Browser-engine emulation does not establish acceptance on a physical iPhone, Capacitor installation, or an installed extension.

## Running

Use Node 22.23.4, the checked-in npm lockfile, Python 3.10+ and Docker Compose v2. Install the pinned browser dependencies deliberately before starting:

```sh
npm ci
npx --workspace=client playwright install --with-deps chromium webkit
python deploy/ci/run-e2e.py run
```

On Steven's Windows PC all Docker-backed execution must enter through the shared runner (and only with 4 GB free RAM and the heavy lock available):

```powershell
$env:AGENT_RESOURCE_OWNER='<session owner from the hook>'
python C:/Users/Nah.STEVEN/.agent-resources/runner.py run --docker --heavy --purpose 'Afavers real backend E2E, ~2.5 GB peak' -- python deploy/ci/run-e2e.py run
python C:/Users/Nah.STEVEN/.agent-resources/guard.py check --owner $env:AGENT_RESOURCE_OWNER
```

The script deliberately pulls only missing exact-version images, pinned to Registry v2 manifest digests verified to include Linux/amd64 on 2026-10-31, then uses `compose up --pull never`. Existing official images are shared warm dependencies. New upstream image references pulled by this invocation are recorded in the ownership manifest and removed at cleanup if unused; existing images are never removed. Upstream images retain their vendor labels; no custom image is built. The project name is unique per run; every container, network and volume has exact owner/lifecycle/project labels. The ownership manifest is `.ci-runtime/<project>/state.json`. Do not remove resources by name prefix.

Only loopback ports 18080 (API), 4173 (app), 18025 (captured mail) are published. Override with `AFAVERS_CI_API_PORT`, `AFAVERS_CI_APP_PORT`, `AFAVERS_CI_MAIL_PORT` if needed. Occupied ports fail before services start. Database passwords, JWTs and cron secrets are generated anew, expire within two hours, live in an ignored root-readable directory and never use the production environment. All migrations run from source and their hashes are recorded. `cron.launch_active_jobs=off` prevents migration-created schedules from contacting real services; cron rows are then disabled explicitly. Mailpit has no outbound SMTP relay.

Playwright's managed foreground preview server is stopped by its runner. Python's `finally` block checks labels and tears down only the exact test project, including its volumes. A workflow `always()` cleanup step handles normal interruptions. After a hard process termination, use the original manifest:

```sh
python deploy/ci/run-e2e.py cleanup --state .ci-runtime/<project>/state.json
```

Before cleanup, the backend/container logs are redacted against the generated environment. Reports live in `reports/e2e/`, `client/test-results/` and `client/playwright-report/`; CI retains them for seven days. Only retired manifests, source hashes and diagnostics remain in `.ci-runtime`. Runtime secret files are deleted after the owned resources are gone. Traces concern only short-lived test identities on a retired local backend.
