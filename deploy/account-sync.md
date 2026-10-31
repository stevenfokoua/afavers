# Account collections and reminder delivery

Apply `supabase/migrations/20261031_account_sync_reminders.sql` through the existing checksum-ledgered migration workflow, install `supabase/functions/send-reminders/` and its shared imports, then schedule a private POST to `/functions/v1/send-reminders` every minute with the existing `x-cron-secret`. The function requires the automation-run migration/helper and the existing self-hosted SMTP environment. No new container, database or external mail provider is needed.

## Account synchronization

`account_items` stores one item per `(user_id,collection,item_id)`. Supported collections are `saved_searches`, `calendar_events`, and `reminders`. A deleted item remains as a tombstone so an old device cannot silently resurrect it. The authenticated user can read their own rows and writes through `write_account_item`:

```
p_user_id: expected app-profile owner
p_collection: one of the three collection names
p_item_id: stable id from the local item
p_expected_revision: null for a new item, otherwise the last observed revision
p_data: full JSON item including id, or null for delete
p_deleted: boolean
p_operation: newly generated UUID, reused unchanged when retrying this operation
```

The result is `{applied,record}`. A revision mismatch returns the account record without overwriting it. The expected owner also guards a request started during an account/token switch. Saved-search writes take a per-user collection advisory lock before the per-item lock, so concurrent distinct-id creations cannot both pass the 12-search quota check. Per-item journals persist in owner-scoped local storage before background writes. Activation immediately overlays pending edits and deletion tombstones over a lagging local cache, even offline. The client imports only the known account's prior local entries, polls while visible every 30 seconds, and refreshes on focus, visibility and network restoration. A lazy-loaded store also activates when login already completed. The legacy unowned storage keys are preserved and never imported automatically.

Conflicting edits stay visible locally. Saved-search dialogs and Settings show explicit choices to keep this device's changes or use the account version. Offline pending changes and deletes survive a normal reload. Invalid journal JSON or invalid record shapes stop synchronization and preserve the original stored text; they are never treated as an empty journal. A visible **Reconnect safely** action first stores an exact owner-scoped recovery copy, then starts a new journal and compares the visible cache with the account. If that recovery copy cannot be stored, the original journal is not reset. Normal retry also rechecks the stored journal if it has been repaired. Recovery copies remain on the same device under the original journal key plus `:recovery:<uuid>` for later manual recovery; they are not transmitted. If browser storage is unavailable, the UI warns the user to keep the tab open until synchronization finishes. The existing local cache is retained after logout and is only rehydrated for its owner.

## Reminder semantics

Reminder data includes `id,title,date,time,type,completed,notes?,linkedJobId?,timezone,emailEnabled`. `timezone` is an IANA identifier, not a fixed offset. Legacy reminders receive the originating device's timezone and default `emailEnabled:false`. Email is an explicit per-reminder option in the create/edit form; automatic job reminders retain their current opt-in and use a stable id per linked job/type. Calendar and saved-search synchronization do not enable job-alert email.

The database converts the scheduled wall-clock value to `email_due_at` in UTC. Nonexistent DST times are rejected; ambiguous times use PostgreSQL's later standard-time occurrence. The browser/native notification helper follows that rule. Browser notifications still require an open page and permission; native notifications retain the Capacitor path.

`claim_due_reminders(p_limit:5)` atomically claims due, confirmed-account, opted-in, uncompleted reminders. A schedule generation changes when the schedule changes or email is newly enabled; editing notes after sending does not resend an old appointment. Initial email opt-in for a past schedule is not armed. Completion, deletion or disabling email suppresses delivery, with a final recheck immediately before SMTP. It cannot recall a message already accepted by the relay.

`finish_reminder_delivery(p_delivery_id,p_state,p_error_code)` records the outcome. Known temporary failures retry after 2, 4, 8 and 16 minutes, with at most five attempts. Explicit permanent rejections stop. A disconnect after DATA submission but before acceptance is **uncertain**, not safe to retry. A killed claim older than five minutes becomes uncertain. The stable Message-ID assists diagnosis but is not an exactly-once guarantee. A failed QUIT after accepted DATA stays successful. The full SMTP exchange, including connection establishment, has a 15-second bound; the worker claims at most three deliveries under a 180-second automation lease, with five-second database-call deadlines.

Unsent schedules older than 24 hours are marked missed in the account status rather than sending an obsolete appointment weeks later. `get_reminder_delivery_status(p_user_id)` gives the signed-in expected owner's current-generation state. Reminders display scheduled, retry, accepted-by-mail-server, failed/missed and uncertain outcomes. To intentionally resend an uncertain/missed reminder, the user edits it to a new future time; this creates a new schedule generation. Accepted by the local SMTP relay is not proof of Gmail inbox placement.

## Verification gates

- Run `accountSyncCore.test.ts` (two devices, legacy migration, immediate offline journal overlays, tombstones, conflict choices, malformed journals/recovery, account-switch response race, lost normalized write response and in-flight edits), `accountSyncStorage.test.ts` (invalid JSON, exact recovery copies, storage failure and collision preservation), `reminderTime.test.ts` (DST/invalid dates/zones), `accountSyncLifecycle.test.ts` and existing private-store/auth/notification tests.
- Run the Deno loopback SMTP tests with only loopback network/environment permission; they send no external mail: `deno test --allow-env=SMTP_HOST,SMTP_PORT,SMTP_FROM --allow-net=127.0.0.1 supabase/functions/_shared/smtp.test.ts`. CI runs the same check, including a real 15-second stalled-DATA deadline.
- On an isolated/owned integration database, authenticate two fixtures. Verify owner mismatch rejects writes; same revision updates; stale revision conflicts; duplicate operation is idempotent; deletion is visible as a tombstone; account B cannot read/write account A's entries. Seed 11 saved searches, issue two distinct-id creates concurrently, and verify exactly one succeeds and the account remains at 12. These checks concern the new tables only, not a general account-security overhaul.
- Verify date conversion in winter/summer and the Europe/Berlin 2027-03-28 gap / 2027-10-31 fold. Verify opt-in=false and completed/deleted reminders are never claimed; an edited future time invalidates an older generation; retries stop at five; expired claims become uncertain; already accepted sends are not claimed again.
- In two browser contexts for the same disposable account, save and delete a search, create/edit/complete/delete a reminder, and add/remove a custom calendar entry. Reload the other context and confirm account data, then exercise an offline mutation and explicit conflict resolution.
- Test one opted-in due reminder to a controlled inbox, retaining SMTP/worker outcomes and honest receipt-vs-inbox qualification. Remove only the owned fixtures, test mail and temporary helper resources.

Root coordinates live migration, cron installation, broad verification, load/resource checks and deployment. This implementation does not change global auth/session settings or create off-site backups.
