# Feature preservation and implementation map

This is the acceptance inventory. Every row needs implementation and exact-candidate verification evidence before release. A visual preview covers representative composition only.

| Existing surface / capability | Proposed organization | Behavior/data to preserve | Acceptance evidence required |
| --- | --- | --- | --- |
| `/dashboard` | Agenda, compact pipeline, configurable supporting widgets | All 11 widget keys, preferences, goals/gamification, calendar, new-feed definitions, map wherever currently exposed | Due/quiet/first-run states; existing preferences honored; count parity |
| `/jobs` | Compact query/filter toolbar, saved-search access, comparable rows | All predicates/sorts, query/location/source/date/remote/student/high-match/status, clear controls, manual add | Predicate parity; phone result height; error/retry; long German content |
| Saved searches | Compact picker plus explicit creation/management | 12 maximum; account/device scope; relative date windows; no email auto-opt-in | Reopen on a later day; account switch; limit and storage failures |
| `/jobs/:id` and wide inspector | Overview / Preparation / Activity | Listing, original URL, match reasons/gaps, source/freshness, status, notes, cover letter, checklist, dates, history, manual job behavior | Deep links; return state; sanitizer; failed-save recovery; shared editor |
| Discovery quality and cache | Existing service/store contract | 30-second account snapshot, invalidation, refresh, latest request wins, location-aware identity, expired discovery filtering, meaningful tracked retention, hide/undo, feed last_seen_at | Existing regression tests plus UI wiring parity |
| `/hotpicks` | Focused single-job review with quiet controls | Swipe and explicit save/hide actions, matching information, undo and tracking semantics | Touch/keyboard controls; empty state; long descriptions |
| `/kanban` | Desktop board and phone stage list | All 9 statuses, drag/drop, dates, notes, manual jobs and existing stage operations | Non-drag path; rollback on failure; archived/rejected/offered reachable |
| `/reminders` | Agenda/date-grouped list and focused forms | Follow-ups, interviews, custom events, account scoping, completion/editing, local notification behavior | Time/date/language cases; add/edit/failure; phone safe areas |
| `/analytics` | Quiet charts/tables, aligned values | Existing status/source/week/location reports, filters, CSV/export | Count parity; empty datasets; export output |
| `/news` | Readable article list and content view | Existing sources, categories, controls and external links | Source/link parity; long content; load failure |
| `/interview-prep` | Organized resource sections | Existing questions, practice/preparation interactions and saved state | Every current section reachable; keyboard and phone |
| `/career-guides` | Resource reading layout | All guides, content and navigation | Route reachable through Resources/More; readable prose |
| `/settings` | Profile/search, alerts, appearance, account | All profile/keyword/location/preferences controls, email opt-in/thresholds, theme/language, destructive account safeguards | Save/failure states; unchanged email configuration; account isolation |
| `/setup` | Compact step-based onboarding | Choices/retry, skip, successful completion fallback, all-results match sorting, no forced high-only filter | Existing setup tests and phone flow |
| `/`, `/demo` | Restrained product explanation and usable demo | Real feature claims only, demo isolation, account routes, existing interactions | No live writes from demo; clear demo label |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Consistent focused forms | Signup/confirmation/login/recovery contracts, redirect/token handling, email behavior | Auth route smoke tests on release; token/no-token errors |
| `/admin`, `/admin-login` | Shared foundation with clear administration context | Role checks, ingestion/operational controls, existing safety boundaries | Authorized/unauthorized checks and operational parity |
| `/werkstudent` | Existing redirect | `/jobs?type=werkstudent` behavior | Old URL still reaches student search |
| `/disclaimer` | Readable legal/information page | Existing content and route | Content parity, link availability |
| Shell / session | Grouped sidebar; phone bottom nav + More | Theme/language, logout/idle warning/session behavior, account identity, skip link | Guards, session expiry, navigation/zoom/focus; no cross-account snapshots |
| Capacitor and extension | Existing companion boundaries | Safe areas, notifications, deep links, extension save/open behavior | Build/integration smoke check; physical-device limitation explicitly reported |
| Alerts backend | No redesign change | Novelty before top-10 selection, 500 candidates / 7 days, recent canonical and all-time exact-id delivery guards | Existing tests stay passing; no related backend diff caused by UI work |

## Required states across representative routes

Loading; loaded; no results; first-run; request error with retry; unavailable item; saving/saved/save failed; disabled action; large list; long title/company; missing salary/location; expired tracked vacancy; signed out; session expiry; account switch; offline/failing network; light/dark; EN/DE; keyboard; coarse pointer; reduced motion; font fallback; 200% zoom.

## Delivered implementation and bounded verification

All routes below retain their existing path. “Smoke” means rendered with isolated synthetic local transport, not live backend acceptance. Source hashes prove service preservation; they do not prove every presentation integration. Exact logs and limitations are in [implementation.md](implementation.md).

| Inventory group | Implemented source | Recorded local evidence / remaining release gate |
| --- | --- | --- |
| Dashboard, 11 widget keys and supporting capabilities | `DashboardPage.tsx`, existing common widgets | Desktop/phone agenda and row captures; source preserves widget keys, visibility/order controls and actions. Real calendar/news/profile data and complete preference migration acceptance remain. |
| Discovery, filters and saved searches | `JobsWorkspace.tsx`, `components/jobs/jobSearch.ts`, `common/SavedSearches.tsx` | URL/window/return-owner tests, original service/store regressions, consecutive filters and rapid search/back browser checks. 390px first result 389.6px; no overflow at recorded sizes. Live volume/offline/storage failure matrix remains. |
| Detail route/inspector, preparation and activity | `JobDetailPage.tsx`, `components/jobs/JobDetails.tsx`, `NavigationGuard.tsx` | Shared component; sanitizer, failed-save/retry, stale-response and draft tests; browser dirty exit, restore/save and result-focus return. Real cross-account session changes and all date/history integrations remain. |
| Cache, quality and alerts backend | Original service/store/backend contracts | Original service SHA256 parity with task start; existing client regressions pass. UI task makes no related backend change. Backend alert delivery integration was not rerun. |
| Hot Picks | `HotpicksPage.tsx` | Shared tokens, original swipe/action semantics retained; route smoke. Physical touch/swipe and complete undo integration remain. |
| Applications | `ApplicationWorkspace.tsx`, shared status selector | Desktop board/phone stage captures, explicit non-drag transition observed, rollback/owner guards in source. Full physical drag/touch and all failed network transitions remain. |
| Reminders | `RemindersPage.tsx`, native modal surface | Render smoke and shared form foundation; notification permission/device integration and all date/time cases remain. |
| Analytics/map/export | `AnalyticsPage.tsx`, `GermanyJobMap.tsx` | Render smoke, static export uses DM Sans; original calculations/export paths retained. Real dataset parity/export output remains. |
| News, interviews, guides | Their existing page components | Render smoke, retained content/sections/links; native video modal. External content failure and physical playback remain. |
| Settings | `SettingsPage.tsx`, lazy route-owned copy | German dark desktop/phone captures, distinct password labels and dirty guard. Live save/email opt-in/password operations intentionally not executed. |
| Setup | `SetupPage.tsx` | Three existing onboarding consumer tests pass after final copy-hook correction; phone/render smoke. Complete fresh live onboarding remains. |
| Public/demo | `LandingPage.tsx`, `DemoJobsPage.tsx` | Explicit illustrative fallback/sample dialog and registration destination; desktop/phone captures. Synthetic local transport performs no live write. |
| Auth, legal and admin | Existing auth/legal/admin page components; guards retained | Public render smoke; unauthorized admin boundary retained. Authorized admin operations and live signup/recovery/token/session acceptance remain. |
| Legacy student route | Existing `/werkstudent` redirect | Route remains mapped to student-filtered Jobs; fresh live integration remains. |
| Shell/session | `WorkspaceLayout.tsx`, `App.tsx`, existing session hooks | Intermediate collapse/expand; phone More/filter Escape focus return; EN/DE/light/dark captures. Actual 200% zoom and full assistive-technology/expiry audit remain. |
| Capacitor/extension | Existing configurations and companion boundaries | Web production build passes, safe-area CSS preserved. No physical-device or installed-extension acceptance claim. |

The compatibility styling layer remains intentionally until these outstanding route-by-route release checks are complete. Removing it now would exceed the evidence available for old route variants.
