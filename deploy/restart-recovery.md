# Afavers restart recovery verification

This is a coordinated, short maintenance drill for **only** the Afavers REST and
functions containers. It does not prove recovery from a host, database or disk
failure. Do not restart database, authentication, Postfix, global nginx or other
VPS deployments for this drill. The existing local-dump restore test is a separate
gate; no off-site backup is involved.

## Preconditions and evidence

1. Run commands under `/opt/afavers/resource-tools/runner.py run --docker`, with
   `AGENT_RESOURCE_OWNER` matching `/opt/afavers/.resource-owner`. Verify all four
   compose containers' owner labels. Save service IDs, start times and health,
   deployed frontend version and the current read-only operations snapshot in an
   owner-marked, root-readable evidence directory. Never export `.env`, tokens or
   raw application/mail bodies into reports.
2. Complete capacity verification before the restart drill. Use a short quiet
   window. Save the exact existing active flags of these three cron jobs:
   `fetch-jobs-every-2-hours`, `job-alerts-every-2-hours`, and
   `send-reminders-every-minute`. Pause only these managed entries, with restoration
   in the coordinator's `finally` path. Do not stop pg_cron or mutate their URL,
   headers or schedule. Record that the pause is planned maintenance.
3. Drain in-flight requests and worker leases. Query `automation_runs` for a
   running, unexpired lease; wait for actual outcomes, bounded by the worker lease.
   Also require zero recent `job_alert_batches.status='sending'` and zero
   `reminder_deliveries.state='claimed'`. Check pg_net dispatches/HTTP requests
   separately: an SQL dispatch completing does not mean the Edge Function finished.
   A stuck lease or uncertain SMTP batch is a stop condition for operator review,
   never permission to resend it. Pause incoming interactive work during each
   short restart if request drain cannot otherwise be confirmed.
4. Prepare one explicitly metadata-tagged disposable account with a private
   manual vacancy and private note. Capture the authenticated read of its own
   tracker record before restarting. Keep its JWT in memory and use that same
   session after restart. Record aggregate live-table counts only; do not change
   real users' data, preferences, alert definitions or credentials.

## Sequential restart and checks

Keep the same foreground runner/coordinator for the following operations. The
commands below assume the owner was exported and checked; compose interpolates
that owner and private environment from the existing deployment directory.

```sh
cd /opt/afavers
docker compose -f compose.yml restart --timeout 20 rest
```

Poll only REST health for at most 60 seconds. Then require public HTTPS REST reads
to work with the existing disposable JWT, including the exact previously written
private note and a bounded public-jobs read. Require zero unexpected status codes
or writes. Compare the database/auth/functions IDs and start times with the saved
baseline. They must remain unchanged. Stop immediately if REST does not recover;
collect bounded logs from that exact owned container without dumping environment.

After REST passes and there are still no active function requests/leases:

```sh
docker compose -f compose.yml restart --timeout 20 functions
```

Poll functions health for at most 60 seconds. Check the public frontend version,
Auth health and the disposable account's unchanged existing session/notes again.
If a bounded read-only functions probe is available, call it only with the
fixture's authenticated token and a documented query; record upstream failure
separately from container recovery. The current Werkstudent search route performs
upstream work and is not a local service health check.
Do not use an alerts/reminders endpoint as a health probe because those may send
real mail. If no safe read-only functions route is available, use container health
plus the next explicitly authorized monitored import and record this limitation.

Restart preserves container IDs; only the targeted container's start time should
change per step. Verify database/auth start times and IDs, all four owner labels,
healthy states, frontend version and the fixture record at the end. Do not run
`compose up`, rebuild images or change volumes/configuration as a recovery shortcut.

## Resume and acceptance

Restore only the previously active managed cron entries. If a service remains
unhealthy, explicitly report the exact paused entries and initiate controlled
service recovery; do not leave schedules silently disabled or restart unrelated
services. Preserve any delivery batch whose SMTP acceptance is uncertain.

Observe actual terminal `automation_runs` outcomes after resuming. Record direct
`verification` probes separately from naturally scheduled `cron` cycles; require
the agreed consecutive real scheduled cycles before declaring scheduler recovery.
Check relevant HTTP outcomes as well as the pg_cron dispatch rows. Confirm the
operations monitor reports healthy recovery and no new uncertain/failed delivery
or accepted-receipt backlog. Do not generate an extra email broadcast for the drill.

Finally delete only the exact metadata-checked disposable account and verify its
profile/manual-job/tracker/settings/alert rows cascaded away. Record real-user
data preservation and run the resource guard. Copy the sanitized evidence to the
release report, then remove the exact owner-marked temporary evidence directory;
if cleanup needs retry, retain a concrete reason and a review deadline within 24h.

## Small concurrent capacity probe

`verify-capacity.py` performs a bounded HTTP pilot, not a browser-render or
maximum-load benchmark. It creates 3–5 confirmed synthetic accounts without mail,
uses only private manual fixtures, removes their default import/alert settings,
and immediately retires the exact metadata-tagged accounts in `finally`.
Credentials stay in memory. Prefer `trigger` so provisioning finishes before the
authorized monitored import begins; `observe` needs an existing live import and
can fail honestly if that import finishes before every user overlaps it.

```sh
export AGENT_RESOURCE_OWNER="$(cat /opt/afavers/.resource-owner)"
python3 /opt/afavers/resource-tools/runner.py run --docker \
  --purpose 'Afavers bounded 3-user HTTP pilot during one authorized import' -- \
  python3 /opt/afavers/verify-capacity.py --users 3 --seconds 30 --import-mode trigger
```

The probe stops new workload on a failed request, a request over five seconds,
available memory below 512 MiB, container memory at 95 percent, low disk, new swap
out above 64 MiB, sustained 95 percent host CPU, excessive host load or an aged
Afavers mail queue. It continues bounded observation of an already-running real
import without killing it. Each operation and the overall workload must meet the
configured p95 latency bound (default 2s). The JSON report records every sanitized
latency/status, actual import overlap/outcome, resource samples/peaks, queue state,
service identity/health and exact fixture cleanup. A partial import is explicitly
reported; capacity success does not turn partial provider coverage into complete
feed coverage. No alerts/reminders function is invoked by this probe.

The printed path is an owner-marked `/opt/afavers/capacity-verification-<nonce>`
folder. Copy its sanitized report into the release evidence, then retire that
exact folder after confirming `.owner` and `cleanup.complete=true`. Failed cleanup
keeps a private fixture manifest with a concrete 24h review deadline; retry through
the same runner using `--cleanup-only /opt/afavers/capacity-verification-<nonce>`.
Never remove arbitrary accounts, directories, processes or mail queue entries.
