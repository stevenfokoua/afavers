# Design and verification contracts

Reuse the current static React/Vite frontend, self-hosted Postgres/Auth/PostgREST/Edge workers and SMTP. Add no always-running application server or heavyweight observability stack to the VPS. Periodic lightweight systemd/cron work is appropriate. New private data tables use the existing authenticated-user ownership pattern; global authentication, role and session changes are excluded.

## Matching

One shared pure implementation supplies keyword/phrase/alias matching and transparent relevance signals to application discovery, Hot Picks, feed filters and alert scoring. Avoid substring false positives for short terms, invalid/future-date freshness, duplicate vacancy inflation and unsupported claims about missing user qualifications. Evaluate a reproducible set of at least 20 current listings using dated market context and saved preferences.

## Imports and delivery

Persist actual worker runs and distinguish complete, partial, failed, timed-out and overlapping runs. Record bounded source-level counts/errors and real last completed import. Bound concurrency/retries/HTTP timeouts and preserve existing listings on incomplete upstream fetches. Do not treat successful SQL cron dispatch as successful HTTP work. Verify consecutive real runs and one targeted alert delivery through the existing self-hosted mail path; do not broadcast test messages to friends.

## Cross-device state

Saved searches, custom calendar entries and reminders sync to authenticated account data. Preserve and migrate existing per-account browser data. Persist pending edits and tombstones, survive offline/reload/account switches, and surface conflicts without silently discarding changes. Store scheduling in UTC with IANA timezone semantics. Server delivery respects opt-in, completion/cancellation/edits, bounded retries and explicit SMTP uncertainty; do not claim exactly-once SMTP delivery.

## Operations and releases

Measure a small concurrent-user search workload while imports run, inspect memory/CPU/disk/mail queue, and verify existing local backup recovery in an owned disposable target. Monitor only this application's health, stale/failed automation, resource thresholds, mail failures and TLS renewal. Preserve other VPS applications.

Version deployments from a reproducible committed source and immutable hash manifest, run unit/type/build plus automated important browser workflows, preserve rollback and perform live smoke checks. Device/extension, keyboard, contrast, zoom/reflow and reduced motion evidence must name the actual tested environment. Browser viewport emulation does not establish physical-device or native iOS acceptance.
