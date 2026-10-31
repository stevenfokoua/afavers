# Afavers self-hosted deployment



Chosen host: saintcreators VPS, SSH alias `strato`, IP `194.164.207.240`.

Public address: `https://afavers.saintcreators.com`.

Application source: `C:/Users/Nah.STEVEN/Documents/Projects/afavers`.



## Status on 27 October 2026



The site is live at https://afavers.saintcreators.com. Public DNS resolves to

194.164.207.240. HTTP redirects to HTTPS; public routes and the Auth health

endpoint passed. The Let's Encrypt certificate expires 25 January 2027.

The existing Certbot timer is active, a scoped Afavers reload hook is installed,

and a renewal dry run including that hook passed.



`deploy/publish.py` can validate/reload this site's HTTPS configuration again.

It tolerates the short new-worker startup interval after graceful reload.



Signup confirmation and password reset were tested using actual emails delivered

by Postfix to an exact local-only alias, then opened through the public HTTPS UI.

Unconfirmed login failed; confirmation enabled login; reset changed the password;

the old password failed and the new password signed in. Test accounts, alias,

mailbox and private credentials were removed. No mail-catching server stays up.

Delivery to Gmail or other external inboxes has not been tested.



## Runtime and efficiency



Nginx serves `/srv/www/afavers/current`; no Node/Vite server remains in production.

The required backend is entirely local in `/opt/afavers`:



| Component | Pinned image | RAM cap | CPU cap |

| --- | --- | --- | --- |

| Database | supabase/postgres:17.6.1.136 | 384 MiB | 0.75 |

| Auth | supabase/gotrue:v2.197.0 | 128 MiB | 0.30 |

| REST | postgrest/postgrest:v14.18 | 96 MiB | 0.30 |

| Functions | supabase/edge-runtime:v1.77.4 | 384 MiB | 0.75 |



The four containers sampled about 252 MiB combined after import. This is an idle

working-memory sample, not a peak/load guarantee. Their combined memory caps

are 992 MiB, container swap is disabled, and connections, PIDs and logs are bounded.

Functions allow two active workers and a bounded queue. The existing app does

not use Studio, analytics, Storage or Realtime servers, so these are not started.

Database, Auth, REST, all four functions, imports and alerts are retained.

Existing VPS applications, databases and mail configuration were preserved.



Auth/REST/functions bind loopback ports 18991/18992/18993; the database publishes

no port. Internal API 18980 binds Docker's host gateway only. One UFW rule permits

only the owner-verified Afavers bridge/subnet to this port. The exact rule is in

`/opt/afavers/firewall-receipt.json`. Re-run configure-firewall.py if the owned

network is recreated; never blindly reuse a bridge name from another network.



## Operations and ownership



Resource owner: `01a17ca0-708b-7502-88a2-e933cab4cece`. All eight production

Docker resources are labelled persistent with owner and purpose. The unmodified

resource runner/guard/registry live in `/opt/afavers/resource-tools`, using the

VPS's local Docker engine. Use the runner for every Docker-backed operation:



```sh

cd /opt/afavers

export AGENT_RESOURCE_OWNER=01a17ca0-708b-7502-88a2-e933cab4cece

python3 resource-tools/runner.py run --docker --purpose 'Inspect Afavers' -- docker compose ps

python3 resource-tools/guard.py check --owner "$AGENT_RESOURCE_OWNER"

```



Do not globally prune Docker, delete database volumes or alter other deployments.

Guard output deliberately lists this persistent production app as retained.

`/opt/afavers/.env` contains root-only private backend credentials. Never print,

commit or place it in the web root. Frontend/extension get only the public API

URL and anon key. generate-secrets.py refuses to overwrite existing secrets.



Migrations are checksum-ledgered in afavers_internal.migrations. The migration

runner skips unchanged files and refuses edits to previously applied files.

Bootstrap SQL and Auth helper ownership are documented in deploy/bootstrap.

Account identity and row policies use Auth UUIDs, not mutable email claims.



Imports run every two hours at :00; job alerts run every two hours at :15.

Both schedules use the private API URL and generated cron secret. At the initial

check schedules were active, but a scheduled run had not yet occurred.

verify-operations.py reports schedule, listing, backup and memory status.



Bundesagentur uses the current v6 response format with URL-budgeted ID batches.

Incomplete/error runs skip stale cleanup; tracked stale jobs are preserved.

Adzuna remains supported but requires the operator's ADZUNA_APP_ID/ADZUNA_APP_KEY;

without those credentials it contributes no listings.



Auth confirmation/reset and job alerts use the existing VPS Postfix relay.

Auth now uses the SMTP certificate's actual private hostname, ubuntu, mapped

to the host gateway. Its read-only custom CA bundle retains system roots and

adds the existing Postfix public certificate. TLS verification stays enabled;

other applications and Postfix TLS settings were not changed. Refresh this

bundle with configure-smtp-trust.py if the Postfix certificate changes. The

current Postfix certificate expires in September 2036. Bootstrap a missing

bundle from the host's system CA file plus Postfix's public certificate before

starting Auth on a replacement VPS; the maintenance helper currently reads the

existing owned Auth container's CA file. Never copy the SMTP private key.



All four mailer URL paths include /backend/auth/v1/verify so emailed links

reach the proxied Auth endpoint. External inbox delivery still needs a test

with an operator-owned recipient, including spam-folder checks.



Shared demo: demo@afavers.saintcreators.com / demo1234, no admin rights. Never

put personal data in it. Friends should each register a separate account.



## Backups, build and rollback



### Afavers DKIM and sender DNS (27 October 2026)



The native `afavers-dkim.service` signs only `afavers@saintcreators.com` as

`d=saintcreators.com; s=afavers202610`, using RSA-2048/SHA-256. The private key

stays in `/etc/afavers-dkim/afavers202610.private`, readable only by opendkim;

the directory is root-owned and marked with this deployment's resource owner.

The signer binds loopback 18994 and is capped at 64 MiB/15% CPU, with no swap.

Its sampled memory was about 4.3 MiB. The unused generic package service is

disabled; only the scoped Afavers instance is enabled.



Afavers Auth and functions now use SMTP port 18995. This dedicated Postfix

service binds only 172.17.0.1 and loopback, permits the verified Afavers subnet

and local host, and uses the signer with temporary failure if unavailable.

UFW permits the bridge/subnet only to the private listener. Global Postfix

milters, main.cf, port 25 and other apps' routes remain unchanged. master.cf

contains one owner-marked block; its pre-change snapshot is kept root-only at

`/opt/afavers/postfix-master-before-afavers-dkim.cf`. configure-dkim.py is the

owner-checked maintenance entry point and must run through the Docker runner.



Six local checks passed: expected signature/domain/selector, cryptographic

verification, tamper rejection, unrelated sender not signed, shared SMTP route

unchanged and global filters unchanged. A real public signup email from Auth

also crossed the private container bridge and its DKIM signature verified with

the generated public key. All test mail/account resources were retired.



**DNS publication is complete (28 October 2026).** The three TXT records were

added through Hostinger in the built-in browser. Google and Cloudflare public

DNS both returned the exact expected SPF, DKIM and DMARC values (six checks

passed). Exact records are in `/opt/afavers/email-dns-records.json` and the

handoff outputs AFAVERS-EMAIL-DNS.txt / .csv; resolver evidence is in

email-dns-publication-check.json. SPF starts with `~all`; DMARC starts with

`p=none`. No aggregate-report recipient was invented. Verify actual recipient

Authentication-Results (SPF/DKIM/DMARC pass) and inbox/spam placement before

tightening policy. External inbox delivery has not yet been tested. Preserve any legitimate senders added meanwhile by

merging SPF rather than publishing a second SPF record.



The backup script now also saves the private signing key root-only with the

private recovery env. Never copy these private files into a web root or source

archive. Restore the key and correct opendkim ownership before rebuilding the

signer on a replacement host, or intentionally rotate with a new selector and

publish the new public key first. Native resources are persistent production;

retire the exact owned listener, service, UFW rule and key only when the app is

decommissioned and real data/key backups have been preserved.



The owner-checked afavers-backup.timer runs daily around 03:40 server time with

a randomized delay, preserving seven root-only database dumps and a private

recovery env copy under `/opt/afavers/backups`. The initial dump and pg_restore

archive inventory passed. Restore drill and off-site copy remain unverified.

Local dumps alone do not protect against losing the VPS.



The successful full build used checksum-verified Node 22.23.4 in a temporary

VPS systemd scope capped at 768 MiB, one CPU, no swap. Windows's occupied shared

heavy-job lock was respected. build-on-vps.py runs installs, all unit tests,

TypeScript/Vite and extension builds sequentially, then removes its temporary

runtime/dependencies. One stable npm cache remains at build-cache/npm.



Future source archives need client, extension, root package files and

supabase/functions/_shared (pure shared helpers are imported by tests). Exclude

.env files, .git, .local and node_modules. Supply public build settings through

/opt/afavers/frontend.env and SOURCE_VERSION. The build script refuses to replace

an existing exported frontend-release. Preserve that release explicitly first.

Run rebuilds through the resource runner with --heavy and the same scope caps.



install-frontend.py checks SHA256, installs a versioned release and atomically

switches current. Assets are precompressed; hashed assets are immutable while

HTML/version/service-worker responses are not. Keep previous releases and

restore the previous current symlink for frontend rollback. Never roll back by

dropping tables or deleting volumes.



The configured Chrome ZIP is in the frontend release. Firefox upstream store

links still refer to the author's extension; signed Firefox distribution of

this fork is not prepared. Do not claim that store install uses this backend.



## Verification and limits



50 unit tests and TypeScript/Vite/extension builds passed in the full run.

Five additional targeted tests cover v6 parsing and encoded filter budgets.

Twenty real backend checks passed: password login, profile mapping, manual jobs,

tracking writes/null dates, two-user privacy, self-admin restriction and function

permissions. Synthetic test users were ownership-verified and deleted finally.



The built production UI passed desktop/mobile checks through an owned SSH tunnel:

login, dashboard, job browsing, Hot Picks and reminders, no JavaScript errors or

horizontal overflow. Mobile actions sit above navigation. Public TLS and local-mail confirmation/reset flows now pass; physical phones remain unverified. Three detector warnings concern existing style

outside the overlap change; global lint debt remains. Email delivery, off-site

recovery and sustained concurrent load are not verified.



Local reminders/calendar/wellbeing data now persist under account-scoped keys.

Old unscoped keys are preserved, unassigned, for verified-owner recovery.



## Job quality and workflow release (28 October 2026)



Release `261028084421` is live. A single account-scoped, in-memory job snapshot

lasts at most 30 seconds after a successful load. Job writes, saved settings,

account switching and Refresh results invalidate it. Failed loads are evicted;

late filter responses cannot replace newer results. No private snapshot is

persisted. This avoids repeated approximately 0.5 MB corpus downloads for the

current 737 public jobs without removing any tracked-job fallback.



Discovery excludes expired/inactive untracked listings, and groups duplicate

role/company/destination combinations after removing known advertising URL

parameters. Every tracked/manual row and history remains available. Feed

observation time comes from the shared job before personal overlays merge.

The append-only 20261028_discovery_quality.sql migration applies equivalent

public-view exclusions, exposes public freshness metadata and indexes recent

alert delivery lookups. It does not delete jobs or application data.



Alerts now exclude previously delivered/touched/expired jobs before taking

the next ten, including canonical destinations delivered under other source

ids in the recent seven-day window. Existing candidate and frequency bounds

remain; do not claim exactly-once SMTP delivery under crashes/concurrent runs.



Saved searches retain up to twelve named filter combinations per account on

the current device, including rolling date windows. They do not enable email

alerts. Setup failures retain choices with retry guidance; completing setup

opens all results sorted by match, and skipping opens browsing directly.



Verification: 74 tests/11 files, TypeScript/Vite and extension builds passed

in the existing 768 MiB/one-CPU/no-swap VPS build scope. Public database checks

used transaction-only fixtures and rollback; a synthetic UI account was retired

after built-in-browser desktop/phone-width and English/German checks. Browser

console errors were absent in the checked session. The source archive, build

context/runtime, stage, copied old export, helper scripts and private test

credentials were retired. The previous served frontend release remains for

rollback. No new resident service was added. See the improvements handoff

receipts for measured direct-read timings and the limits of the checks.


## Claude-reviewed hotfix (28 October 2026)

Release `261028104258` supersedes `261028084421`. Claude Code independently
reviewed the immutable change snapshot with read-only tools, reviewed the
fixes, and gave the final verdict Ready. All 83 tests in 13 files passed, as
did TypeScript/Vite and extension builds in the 768 MiB/one-CPU/no-swap scope.
The real PostgREST delivery embed, public routes/version and all four service
health checks passed after deployment.

Vacancy identity includes normalized location so a shared careers URL cannot
hide another city. Discovery retains meaningful personal status/content even
while a job is still new, but an empty hide/undo overlay no longer bypasses
expiry. Manual additions do not count as newly fetched jobs; saving a newly
fetched job does not reduce added-today. Inactive jobs omit Seen in feed
because the deactivation trigger also updates updated_at. Logout clears the
cache again after the remote sign-out operation. Onboarding separates optional
device writes from the server save and keeps a per-tab completion fallback.
Alert candidate ids are checked against all-time delivery history in batches
of 150, alongside the existing recent canonical-destination check.

No database migration or new service was required for this hotfix. The prior
served frontend remains available for rollback; current/exported frontend,
three updated function files, review text and receipts are intentional
production artifacts. Temporary source snapshots, unused build candidate,
build contexts/runtimes, upload stage and deploy helper were retired.

## Workbench UI release — 28 October 2026

The owner accepted the concrete redesign and authorized deployment. Release
`261028210616` is live at https://afavers.saintcreators.com. The reviewed source
was rebuilt with production configuration in the existing 768 MiB, one-CPU,
zero-swap scope. All 96 tests in 16 files, TypeScript/Vite and extension builds
passed. The frontend remains static; no resident service or migration was added.

All 61 public release files match their hashes over HTTPS, 22 SPA routes return
the correct release, and version/cache/gzip checks pass. Twenty real backend
checks passed. Built-in-browser checks covered login/onboarding skip, manual
jobs, all nine statuses, notes/checklist/cover letter/date persistence, draft
recovery, combined filters and phone return focus, settings, CSV/XLS exports,
English/German, both themes and responsive bounds. Other protected/resource and
public/auth/demo/legal pages rendered without observed browser console errors.

The four backend container identities remain unchanged and healthy. Backend
environment, Compose and Postfix configuration hashes remain unchanged. New
signup/reset emails, physical devices, installed extensions, print/PDF and full
accessibility/zoom acceptance were not rerun; do not infer those from smoke tests.

The first integrity check requested the deliberately blocked `.htaccess` and
exercised automatic static rollback. The corrected check distinguishes protected
files from public assets and resumed the same checksum-verified immutable release.
Previous release `261028104258` remains available for rollback.

Disposable users and the private UI fixture, tracker/settings rows, credentials,
source archive, upload stage and build context/runtime were retired. Final guards
report no temporary leaks; the eight persistent production Docker resources are
retained. The current frontend export, stable npm cache and operational receipts
remain intentional artifacts. Full receipts and live screenshots are in the
chat workspace `outputs/ui-deployment/README.md`.

### Button corners — release 261028220351

The owner requested halving button radii. Shared buttons now use 3px instead
of 6px; existing public/action buttons use 4px instead of 8px (and 2px instead
of 4px where applicable). Inputs and noninteractive panels retain their corners.
Production build and all 61 public file hashes pass; live desktop/phone computed
styles confirm the halving. Backend services and configured extension are unchanged.
Previous release 261028210616 is retained for rollback. Scoped evidence is in
the chat workspace `outputs/button-radius/`.

### Card types — release 261031081145 (31 October 2026)

Five task-specific card layouts are live: job comparison rows, application
cards, dated agenda actions, featured opportunities, and grouped panels.
All 105 tests in 18 files and TypeScript/Vite pass. Twelve pre-deploy browser
workflow checks and six live browser checks pass; eight backend persistence
and privacy assertions verify the test writes. All 64 public asset hashes
match over HTTPS. Backend services/configuration and the extension ZIP are
unchanged. Previous release 261028224803 remains available for rollback.
Disposable account, three private jobs, settings and tracker rows are retired.
See the chat workspace `outputs/card-system/README.md` for evidence and limits.

### Cards and fields — release 261028224803

The owner requested halving card and input-field radii as well. Standard panels
now use 4px instead of 8px; shared fields use 3px instead of 6px. Utility-styled
8px fields become 4px. Linked/clickable vacancy cards, already at 4px after the
button refinement, now use 2px. Existing action buttons retain their prior radii.
The map container and popup corners reduce from 12px to 6px.

Production build and all 61 public file hashes pass. Live homepage, login and
demo computed-style checks verify cards/fields and unchanged action buttons;
the phone layout has no horizontal overflow or observed console errors.
The four backend services and configured extension remain unchanged. Upload
artifacts are retired, guards pass, and release 261028220351 remains for rollback.
Scoped evidence is in the chat workspace `outputs/card-field-radius/`.
