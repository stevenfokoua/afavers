Local implementation authorized on 28 October 2026 by “implement the plan.” Checked tasks record the delivered implementation and bounded local evidence; they do not assert production acceptance. See [implementation.md](implementation.md) for exact results and failures.

## 1. Design acceptance and fresh baseline

- [x] 1.1 Review interactive desktop/phone previews; record acceptance or correction of Workbench versus Focus and proposed tokens.
- [x] 1.2 Capture a bounded route/feature baseline and confirm every coverage.md row against current behavior.
- [x] 1.3 Measure current production-build route chunks, gzip sizes and font transfer with the existing toolchain; retain machine-readable results.
- [x] 1.4 Establish an isolated implementation boundary that preserves all pre-existing working changes; record the exact starting revision/diff.

## 2. Foundation and shared components

- [x] 2.1 Add semantic light/dark tokens, spacing/type scales and small-corner geometry without removing compatibility overrides prematurely.
- [x] 2.2 Self-host DM Sans (body/controls/data) and Manrope (headings) with OFL notices and German glyphs; preserve the existing wordmark as an asset; verify fallback, non-synthetic weights and combined font payload.
- [x] 2.3 Implement the small shared native-semantic control layer and consistent icon strategy within the budget.
- [ ] 2.4 Verify default, hover, focus, pressed, disabled, loading, error and reduced-motion states in both themes.
- [x] 2.5 Implement only the defined detail-selection, save-confirmation and board-movement animations; verify interruption, instantaneous reduced motion and no initial-load/filter-typing replay.
- [x] 2.6 Remove decorative template patterns and generic coaching copy using design.md D9, preserving useful context and every feature.

## 3. Shell and navigation

- [x] 3.1 Group desktop destinations, preserve all paths/guards and expose career guides through Resources.
- [x] 3.2 Implement intermediate collapse and phone bottom navigation/More with safe areas, keyboard behavior and focus restoration.
- [x] 3.3 Preserve theme/language/account controls, logout, idle warning and skip-link behavior.

## 4. Job discovery and shared details

- [x] 4.1 Extract JobsToolbar and shared predicate wiring; keep common filters visible and add accessible advanced filter controls.
- [x] 4.2 Make saved-search selection compact and creation explicit; preserve existing store format, limits and relative windows.
- [x] 4.3 Build comparable JobResultRow/List with visible Save, honest freshness and accessible match explanation.
- [x] 4.4 Implement wide inspector plus existing detail route using one authorized detail component and validated route selection.
- [x] 4.5 Preserve return query/filters/order/range/scroll/focus on phone and browser back/forward.
- [x] 4.6 Wire loading/no-results/error/unavailable states and explicit refresh without changing snapshot, ranking or retention logic.
- [x] 4.7 Add focused discovery interaction/parity tests, including location identity, old request races, hide/undo and personal-edit freshness.

## 5. Application management

- [x] 5.1 Group shared details into Overview, Preparation and Activity while preserving each field's save contract.
- [x] 5.2 Implement consistent pending/saved/error feedback, retained failed drafts, dirty-exit recovery and optimistic rollback.
- [x] 5.3 Restyle the board and add phone stage navigation; preserve all nine statuses and a non-drag keyboard/touch transition path.
- [ ] 5.4 Verify manual jobs, dates, checklist, notes, cover-letter draft, history and account switching across entry routes.

## 6. Dashboard and complete surface coverage

- [x] 6.1 Build the prioritized agenda and consolidated pipeline with authoritative counts and honest empty states.
- [x] 6.2 Preserve all widget keys/preferences, dashboard editing, goal/gamification, calendar and map capabilities.
- [x] 6.3 Migrate Hot Picks, reminders, analytics/export, news, interview preparation and career guides.
- [x] 6.4 Migrate settings, setup, public/demo/auth/legal and administrator routes with existing contracts intact.
- [ ] 6.5 Complete every coverage.md row with implementation and verification evidence; retire unused styling overrides only after coverage is complete.

## 7. Exact-candidate verification and review

- [x] 7.1 Run targeted tests while editing, then one justified full client test/build/lint verification for the unchanged candidate under the resource policy; distinguish pre-existing failures.
- [ ] 7.2 Verify browser flows at 320/390/768/1024/1440, EN/DE, both themes, 200% zoom, long/empty/error content, keyboard, coarse pointer and reduced motion.
- [ ] 7.3 Check phone first-result height, contrast, focus, dialog restoration and no page overflow; retain captures and results.
- [x] 7.4 Compare payload/fonts to the fresh baseline; verify lazy routes and no extra production services or API requests caused by presentation.
- [ ] 7.5 Smoke-test Capacitor/extension compatibility and record physical-device results or the precise remaining limitation.
- [x] 7.6 Obtain independent review of the concrete implementation and resolve reportable findings without treating prototype approval as release acceptance.
- [x] 7.7 Retire exact owned test helpers/resources and run the required final owner check; retain only documented deliverables.

## 8. Authorized production rollout

- [x] 8.1 Present the concrete candidate, evidence and rollback plan for deployment authorization if not already supplied for that candidate.
- [x] 8.2 Deploy the versioned static frontend with the established procedure; preserve backend containers, records, preferences and mail configuration.
- [x] 8.3 Verify served release/asset consistency, representative private/public flows and rollback availability; report exact deployed version and remaining limitations.

## Verification qualifications

- 1.1: implementation authorization adopts the finalized Workbench direction; concrete-candidate human visual acceptance is still a release gate. 1.2 records the source/feature baseline, not exhaustive live workflow acceptance.
- 2.4, 5.4, 6.5, 7.2 and 7.3 remain open for the complete state, integration, contrast/assistive technology, physical touch and actual 200% zoom matrix. Representative synthetic browser flows and focused tests passed; do not inflate them into full acceptance.
- 7.1: type/build pass; 96 assertions pass across test phases and a focused worker retry. Main invocation retains an infrastructure failure; lint retains historical diagnostics. No claim of an all-green command.
- 7.4: phone +9,505 bytes passes the numerical cap; wide +22,059 exceeds it. The reviewer accepts WIDE-INSPECTOR-01 only for the automatic wide inspector. Fonts total 62,692 bytes, original services unchanged, zero new resident services.
- 7.5: source/build compatibility retained; physical Capacitor devices and extension installation were not exercised.
- Phase 8 is complete following explicit owner acceptance and deployment authorization. Release 261028210616 is live; broader device/accessibility/email acceptance remains qualified in the deployment receipt. No database or mail configuration was changed.

The finish reviewer scored all six material fixes resolved (`.impeccable/review/finish-verdict-final.md`, disposition **ship**, at the scored-fix scope). The built design system is recorded in root `DESIGN.md` and `.impeccable/design.json`. Temporary server/tabs and 37 exact owned helper files/directories are retired; final guard verifies no outstanding resources. Review evidence and reproduction archives remain documented deliverables.
