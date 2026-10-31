# Import and job-alert operations

Apply the append-only `20261031_automation_runs.sql`, `20261031_automation_timeouts.sql` and `20261031_job_alert_batches.sql` migrations before deploying the workers. Existing cron URLs and private headers are preserved. The timeout migration changes only the two managed jobs' HTTP timeout to 145 seconds; it does not edit historical migrations.

Apply `20261031_job_source_details.sql` before deploying detail enrichment. It adds
`description_quality` (`summary`/`full`) and `details_checked_at` without changing
existing application data or access policies.

## Worker evidence

`automation_runs` records the actual Edge Function's running/succeeded/partial/failed/timed_out outcome, not merely a successful `net.http_post` dispatch by pg_cron. `begin_automation_run(task,trigger,lease_seconds)` uses an atomic per-task lease; `finish_automation_run(run_id,status,sources,counts,error_code)` finishes only the still-current lease. Interrupted workers become timed_out when the next run starts, and appear timed_out immediately in `get_feed_health()` after lease expiry. The last 500 terminal rows per task are retained. No credentials, search terms, URLs or raw provider bodies are included in source reports.

Tasks are `fetch-jobs`, `job-alerts` and `send-reminders`. The import and alert routes accept `x-afavers-verification: 1` only after their existing authorization succeeds; direct verification calls are then tagged `verification`, while normal cron calls are tagged `cron`. Do not count direct verification calls as naturally scheduled cycles.

`get_feed_health()` is a signed-in, read-only summary suitable for the job page and dashboard. It exposes the latest import outcome, per-source counters, the last complete successful import, the last usable update (including partial results), and the latest job-alert outcome. Root/operator monitoring can read the underlying service-only table for all three tasks. A six-hour age threshold is appropriate for the configured two-hour import interval. A fresh partial update is distinct from both a complete refresh and a stale/failed feed.

## Fetch bounds

Bundesagentur uses the verified v6 `maxErgebnisse` total, paginates fairly after each configured query has had its first page, and rotates query starts between two-hour cycles. Adzuna uses the same configured search terms/locations. Providers without configured credentials report `disabled`, not a healthy empty feed or a provider failure.

Each source is limited to 40 keywords × 20 locations, 5 pages per search and 5,000 unique listings. The shared deadline is 85 seconds; individual requests stop within 8 seconds or the remaining budget, whichever is shorter. A transient rejection/network failure gets at most one retry. Short Retry-After is honored; a longer provider cooldown stops this source rather than issuing requests earlier than requested. First-page coverage, retries, failures, caps and discarded coverage are explicit counters. Caps/timeouts/failed queries yield partial or failed outcomes and **never authorize stale cleanup**. Existing tracked/manual applications retain the earlier preservation rules.

### Source descriptions

The official provider response was checked on 2026-10-31: v6 search returns only
listing summaries; `/pc/v4/jobdetails/{base64(reference)}` returns the full
`stellenangebotsBeschreibung`. The corresponding v6 detail route returned 403.
The worker therefore uses the verified v4 detail endpoint alongside v6 search.
Search receives at most 55 seconds and reserves about 30 seconds within the same
85-second fetch budget. Detail enrichment makes at most 60 lookups per run with
concurrency four and five-second request timeouts, one transient retry, provider
cooldown handling and a rotating backlog. It never fetches third-party pages.

Full descriptions are capped at 20,000 characters and cached for three days;
missing/empty detail responses are checked again after 12 hours. An explicit
application-closing date in the source prose may populate `deadline`; publication
or employment-start dates do not. No unverified language/API field is invented.
Source text feeds the separate explicit-language-requirement parser.

Summary-only refreshes preserve previously fetched full description, language,
deadline and pay fields. Payload shapes are written in separate groups so
PostgREST cannot replace omitted rich fields with NULL. Existing manual/tracked
jobs keep their earlier preservation rules. Detail lookup failure retains the
search result and never becomes a fabricated full description.

Per-source `details` counters separately report full descriptions, fresh cache,
attempts, enrichment, unavailable bodies, failed/deferred lookups, retries,
timeouts and cache availability. Search coverage and description coverage are
different: a complete listing search does not promise full descriptions for all
jobs. Feed details show that coverage explicitly. Detail counters contain no
reference IDs, queries, URLs, raw descriptions, contact details or credentials.

## Alert acceptance ledger

The bounded alert runner scans at most 100 eligible alert definitions and 5,000 recently added candidates per invocation. Definitions rotate by `last_checked_at`; `last_sent_at` changes only for an accepted email, so an empty daily check cannot suppress jobs arriving later that day. Scoring is shared with the client, and configured keyword/location criteria must actually match before emailing, even for lower user-selected score thresholds. Exact-id and canonical-destination delivery history and personal status/hiding are checked before selecting ten jobs.

`claim_job_alert_batch` atomically claims an immutable recipient/body/job-id batch with a stable Message-ID. It also checks that the alert remains enabled, belongs to the recipient and still has the same matching configuration. States:

- `sending`: handoff in progress; a worker lost for more than three minutes becomes `uncertain` on the next claim.
- `accepted`: SMTP accepted the message; the history transaction is still pending. Retry `finalize_job_alert_batch(id)` to write history without sending the message again.
- `recorded`: acceptance/history committed; body, subject and recipient copies have been cleared from this ledger. The stable batch id and job references remain.
- `retryable`: a definite transient rejection before acceptance. The same batch retries with the same Message-ID, at most three attempts. Earliest retry is 5/15 minutes, serviced by the next scheduled worker invocation.
- `uncertain`: acceptance cannot be ruled out. Automatic resend is blocked; inspect local Postfix logs/queue for the stable Message-ID before marking accepted or permitting a retry.
- `failed`: definite permanent rejection or retry limit reached. Inspect the address/relay error before requeueing.
- `cancelled`: recipient/preferences/candidate eligibility changed before delivery. Future runs can prepare a fresh eligible batch.

The finalizer atomically inserts unique delivery records and updates last_sent_at, closing the SMTP-accepted/database-history-write gap. Stable Message-ID alone is not an exactly-once guarantee; ambiguous SMTP outcomes are intentionally held for review.

Operational monitoring should flag repeated run failures, an overdue run, unrecorded accepted batches, uncertain handoffs and failed batches. Inspect only the relevant managed Afavers records; never globally flush the VPS mail queue or change unrelated deployments. Live verification, naturally scheduled-run observation and inbox receipt are separate gates, owned by the release coordinator.
