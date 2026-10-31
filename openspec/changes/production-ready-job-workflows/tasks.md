# Readiness acceptance checklist

## 1. Job relevance
- [ ] Share app/feed/alert word/phrase matching; cover GIS/IT false positives, aliases and compounds with tests.
- [ ] Preserve and explain location/language/seniority/freshness signals without assuming qualifications.
- [ ] Record current official German/NRW market sources and separate demand from personal fit.
- [ ] Evaluate at least 20 actual current vacancies and document remaining fit limitations.

## 2. Import and alert reliability
- [ ] Persist actual source/run outcomes, last success, overlap and timeout outcomes.
- [ ] Bound retries/pagination/concurrency; preserve data on partial/failed upstream runs.
- [ ] Surface honest feed freshness and incomplete/stale guidance in the UI.
- [ ] Verify multiple consecutive actual scheduled runs, including failure/partial fixtures.
- [ ] Verify a targeted real job-alert email and prevent test broadcasts/duplicate delivery.

## 3. Cross-device state and reminders
- [ ] Account-sync saved searches, custom calendar and reminders with legacy-data migration.
- [ ] Verify offline/reload edits, deletes, cross-device reads, conflict handling and account-switch races.
- [ ] Schedule opt-in server reminders with timezone/DST, cancellation and bounded delivery retries.
- [ ] Verify actual delivery with page closed and honest local-notification guidance.

## 5. Shared VPS operation
- [ ] Measure a bounded concurrent-user workload alongside import processing.
- [ ] Add lightweight app-specific health/resource/automation/mail/TLS monitoring.
- [ ] Verify restart recovery and existing local database restore in an owned disposable target.
- [ ] Preserve unrelated workloads and retire all temporary resources; no off-site backups.

## 6. Reproducible releases and device acceptance
- [ ] Add automated browser workflow gates plus existing unit/type/build gates.
- [ ] Commit a reproducible release source without private credentials and verify exact installed hashes.
- [ ] Verify supported desktop/phone browsers, installed extension and relevant Capacitor compatibility.
- [ ] Verify keyboard, contrast, actual zoom/reflow, long/error/empty states and reduced motion.
- [ ] Deploy the checked candidate, verify live workflows and preserve rollback.

## Explicit exclusion
Goal 4 is not part of this change: do not expand login throttling, authentication/session behavior, admin-role policies or perform an unrelated security overhaul. Minimum ownership controls on newly introduced private data remain mandatory functionality.

Unchecked items are not achieved. Link authoritative receipts for each checked item; unit tests alone do not prove live scheduler, SMTP or physical-device acceptance.
