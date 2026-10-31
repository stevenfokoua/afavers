## Context

Status: finalized planning draft revised after font/motion feedback, 28 October 2026. The owner explicitly requested final mockups/specifications first. Not an implementation or visual approval record.

The app already has route splitting, protected/admin routes, account-scoped state, discovery caching, saved searches, tracking and tested backend behavior. Its current styling combines many hardcoded Tailwind colors with global dark-mode overrides, Lato body text, a Figtree wordmark, large corners and several unrelated control treatments.

Confirmed constraints: keep the name/logo, use green sparingly, serve desktop and phone equally, preserve every feature and remain efficient on the shared Saintcreators VPS. The research and previous captures in this chat are evidence of the current design; historical build/test receipts do not validate the proposed redesign.

## Goals / Non-Goals

**Goals:**

- Bring useful vacancies into view sooner and make rows easy to compare.
- Keep current state, the primary action and save feedback understandable.
- Make navigation, forms, panels, tables and states consistent across routes.
- Support phone touch workflows, wide-screen comparison, keyboard use, EN/DE and both themes.
- Preserve services, private data, matching/freshness semantics and static delivery.

**Non-Goals:**

- Rebuilding the backend, changing job ranking or adding AI matching.
- Removing features, changing authentication/email configuration, adding off-site backups or new production services.
- Treating mockups as wired production code, live vacancies or approval to deploy.
- Recording a permanent image-first/code-first preference. This planning task specifically uses interactive Visualize mockups.

## Decisions

### D1. A restrained job-search workbench

Use a neutral working surface with thin separators, predictable control placement and a clear text hierarchy. Green indicates selected context and useful positive state; charcoal supplies most primary button emphasis. Preserve the orange character in the existing wordmark. Avoid decorative gradients, glass, repeated card shells and color-coded peer widgets.

The user's pinned Apple/Vercel direction takes precedence over Impeccable's exploratory concept roll (`d9e34e3a`). Its useful disciplines are translated into consistent alignment, comparable rows, clear state vocabulary and whole-surface coherence, without importing unrelated decorative worlds. The preview offers a Workbench (list plus inspector) and Focus (list then full detail) alternative inside the same visual system. Workbench is the recommended implementation candidate; Focus remains an explicit alternative, not a second theme to build.

Alternative considered: a purely cosmetic class replacement. Rejected because it would preserve the excessive filter height and competing actions. A marketing-style Apple layout would also spend too much vertical space on routine work.

### D2. Semantic CSS tokens and a small component layer

Add `client/src/styles/tokens.css` and `client/src/components/ui/` during implementation. Keep existing Tailwind integration. Pages use named surface/text/border/state tokens instead of new arbitrary colors. Convert the main flows first; retire global hardcoded-color overrides only after every dependent page is migrated.

Proposed tokens, subject to visual review:

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#fafafa` | `#111315` |
| Surface | `#ffffff` | `#181a1d` |
| Secondary surface | `#f4f5f5` | `#202327` |
| Primary text | `#181b1f` | `#f3f4f5` |
| Secondary text | `#58616c` | `#b0b6bf` |
| Border | `#e2e5e8` | `#363b42` |
| Accent text | `#067647` | `#75dda6` |
| Accent surface | `#edf8f1` | `#153626` |

Control radius 6px; panel radius 8px; badges 4px; round shapes limited to avatars or genuine circular icon controls. Spacing scale: 4, 8, 12, 16, 24, 32, 48px. Main page title 28/34px; section title 18/26px; body 16/24px; compact desktop label 14/20px; supporting metadata 12/18px. Never shrink phone editable fields below 16px.

Use **DM Sans** for body copy, labels, controls, job-result titles and tabular data at weights 400/500/600. Use **Manrope** at weights 500/600 for page, section and detail headings. Manrope is the selected free substitute for Object Sans: its geometric construction and restrained shapes fit the requested direction, without claiming an exact match. The user explicitly accepted using a similar free font. Both families are published under the SIL Open Font License; retain their license/copyright notices with self-hosted, subsetted variable WOFF2 assets and verify German glyphs. Use only required upright axes/weights, `font-display: swap` and non-synthetic weights.

Define `--font-ui: 'DM Sans', system-ui, sans-serif` and `--font-heading: 'Manrope', 'DM Sans', system-ui, sans-serif`. Keep the existing Figtree wordmark as a preserved brand asset, not a third UI family; a faithful outlined logo asset can avoid loading a whole logo font during implementation. Do not change its shape or colors. No runtime dependency on Google Fonts in production; the conversation preview may load approved font resources. DM Sans and Manrope together remain subject to the existing 100 KiB new-UI-font budget.

Initial shared components: Button/IconButton, Field, Select, Checkbox/Switch, Badge/StatusLabel, Tabs, PageHeader, Toolbar, EmptyState, Skeleton, InlineError, Toast, Disclosure and an accessible Dialog/Sheet only where necessary. Keep native form semantics; do not install a full visual framework.

### D3. Compatible shell and information architecture

Keep all current URL paths, protected/admin wrappers and onboarding redirects. Group desktop navigation into Search (Overview, Find jobs, Hot Picks), Track (Applications, Reminders, Analytics) and Resources (News, Interview prep, Career guides). Put Settings and account/theme/language controls in the shell footer. Admin appears only for authorized administrators.

At widths below 768px use a compact header and five bottom destinations: Home, Jobs, Applications, Reminders, More. More exposes every secondary destination, language/theme, settings and account actions. At 768-1199px use a collapsible rail/drawer with readable labels on demand; at 1200px and above show the expanded sidebar and, when there is sufficient content width, the jobs inspector. Breakpoints apply to usable content width when a sidebar or zoom changes available space.

Retain skip link, active destination announcement, safe-area padding and visible focus. Preserve browser back/forward behavior and old bookmarks. No global command palette is required for this release.

### D4. Route-backed jobs selection with recoverable search context

Extract `JobsToolbar`, `JobResultList`, `JobResultRow`, `JobDetailsContent` and `MatchExplanation` from the existing pages. Keep `jobsService`, snapshot invalidation, filter predicates and ranking as the behavior layer. No second data cache or duplicate inspector fetch is needed for already loaded jobs.

- Wide layout: roughly 45% results / 55% inspector inside the main workspace, with an actionable result row selected. At narrower content widths, use list then full detail.
- Wide selection uses an optional `job` search parameter on `/jobs`; existing `/jobs/:id` links remain valid and render the full detail page. Validate an ID and fetch through the existing authorized service when it is not in the current result set. An unavailable job shows recovery, never a blank inspector.
- Phone selection navigates to `/jobs/:id` and preserves a serializable, non-sensitive search return state. Back restores query, filters, ordering, loaded range, focused row and scroll anchor. Existing URLs without new parameters still work.
- Put query/location, the most-used filter affordances, sort and saved-search access together. Advanced filters open an anchored non-modal panel on desktop and a focus-managed sheet on phone. Applied filters remain visible and individually removable. Do not reset filters when changing layout or opening a vacancy.
- Saved-search creation opens on explicit request; selecting a saved search remains one compact control. Preserve the current account/device scope, limit of 12 and relative date-window semantics. Never imply it enables email alerts.
- Rows prioritize title, company, location/work arrangement, match and freshness. Show one concise match explanation on request; detailed reasons/gaps remain available. Keep Save visible; group status changes in a labeled control and keep Apply clearly distinct from a local status update.
- Opening a listing never means the application was submitted. Hide retains undo and existing retention behavior. Distinguish posted time, last observed in feed and personal modification time.

Alternative considered: inspector-only URLs or local selection without routing. Rejected because deep links and browser history must remain predictable. Avoid an inspector at widths where either list or prose becomes unreadable.

### D5. One application editor shared by board and details

Compose the same job detail content into an inspector or page; do not duplicate editing logic. Group existing fields into Overview (listing, match, status and dates), Preparation (checklist, private notes, cover-letter draft) and Activity (history). Preserve each field's current save semantics; show pending/saved/failed feedback, retain failed drafts and use rollback for failed optimistic status updates. Navigation away from dirty, unsaved content offers a recoverable choice.

The board retains all nine domain statuses. Desktop supports existing drag/drop plus a labeled status menu. Phone defaults to a selected-stage list with counts and a stage picker; the status menu supports touch and keyboard. No action depends solely on dragging. No status normalization, destructive migration or storage-key reset is part of this change.

### D6. Dashboard with one prioritized agenda

Show due follow-ups and upcoming interviews before discovery prompts, followed by incomplete applications and a compact pipeline summary. Use one consistent definition for every displayed count. Empty agenda states lead to finding jobs or setting a goal without fabricating urgency.

Keep every existing widget key: news, stories, newJobs, followUps, interviews, applications, quickActions, goal, calendar, pipeline and weeklyActivity. Preserve visibility preferences and editing. Consolidate duplicate presentation; do not remove the underlying information or goal/gamification behavior. Retain map functionality wherever currently exposed, loaded only when its visible surface needs it.

### D7. State, language and accessibility as component contracts

Reuse the existing language and theme stores. Translate new labels and accessible names in EN/DE; use locale-aware number/date formatting and distinguish event dates from relative feed dates. Theme selection remains explicit and persistent; a first visit can follow the system preference only where compatible with existing behavior.

Provide default/hover/focus/pressed/disabled/loading states, honest no-results and first-run states, and inline recoverable errors. Live results updates are polite; no announcements on every hover. Tabs, dialogs, menus and sheets follow native/ARIA keyboard patterns, restore focus and avoid clipping. Notes and job-description HTML retain the existing sanitization boundary.

### D8. Lightweight implementation and reversible release

Retain lazy routes. Keep chart/map code out of the shared shell and the initial discovery path. Use tree-shaken icons or a small checked-in SVG component set; no WebGL, decorative animation engine, resident Node process or new SaaS.

The motion thesis is continuity while selecting or moving an opportunity, with small acknowledgments after a successful action. Use these three effects only where the corresponding action occurs:

| Interaction | Treatment | Limit |
| --- | --- | --- |
| Select a job / open details | Bounded lateral settle of 8px on the detail content, keeping content visible throughout; no opacity fade or whole-page movement | 180ms |
| Save a job | Bookmark/confirmation control compresses to 0.92 and returns to 1, without bounce, on confirmed state change | 120ms |
| Move an application | Measure old/new card bounds and use a FLIP transform to establish the destination; instant state update and immediate fallback when measurement is unavailable | 180ms, at most 200ms |

Use `cubic-bezier(0.2, 0.8, 0.2, 1)` for spatial arrival and a short ease-out for confirmation. Use CSS or Web Animations API; no animation library. Cancel superseded animations so repeated input does not queue movement. Do not replay motion during text editing, initial page load, filter typing, background refresh, host review-state restoration or simple rerendering. Make reduced-motion paths instantaneous while retaining text/icon state feedback. Do not use generic fades, fade-and-rise, scroll reveals, floating cards, bounce, celebratory effects, count-up numbers, shimmer or decorative loops. Loading feedback is a quiet static skeleton/status, not an ongoing performance cost.

Measure a fresh production build before implementation and compare the same toolchain afterward. Proposed hard gate: initial-route compressed JavaScript grows by no more than 10 KiB without an explicit reviewed exception; new UI font transfer totals at most 100 KiB. No increase in production service count or provisioned server memory is permitted for this frontend work. Lab timing and field metrics are reported separately.

### D9. Concrete visual and copy exclusions

Treat the owner's request to remove an AI-generated appearance as actionable constraints: no decorative gradients or glass; no glowing accent borders; no oversized hero statistics; no equal tile grid standing in for organization; no nested card shells; no decorative company-initial tiles where plain text is clearer; no emoji icon system; no gratuitous badges or pills; no fabricated proof or filler sections. Keep neutral separators, aligned text, useful counts and ordinary controls.

Use direct labels such as Find jobs, Upcoming, Suggested jobs, Notes and Weekly applications. Remove motivational taglines, design-process commentary inside the product, feature-preservation promises in user flows and redundant helper paragraphs. Preserve real goals, charts, widgets and data; presentation simplification never authorizes capability removal. Context that helps a user make a decision remains visible.

## Risks / Trade-offs

- [Compact rows can hide useful context] → Keep title/company/location visible, preserve accessible explanations and compare with long German content before adoption.
- [Inspector duplicates requests or editing state] → Reuse the existing snapshot and one editor; test latest-request-wins and account switching.
- [Filters become harder to discover] → Keep common controls and active criteria visible, with a labeled Filters count; test phone discoverability.
- [Visual refactor changes data semantics] → Preserve service/store contracts, add parity tests for caching, expiration, matching, alerts and ownership.
- [Old dark overrides leak into migrated pages] → Use a bounded compatibility layer and remove it only after route-by-route checks.
- [New typography causes layout shift or font failures] → Self-host subsetted WOFF2, reserve control geometry and verify fallback rendering.
- [Board loses touch or keyboard functionality] → Test status menus independently of drag/drop and preserve all domain statuses.
- [Prototype suggests live operations] → Label illustrative content, keep all mock interactions local and prohibit network/account writes.
- [Large working tree contains earlier changes] → Record the starting state and keep the redesign's implementation/commits isolated; do not reset or overwrite previous work.

## Migration Plan

1. Review this package and the representative desktop/phone previews. Resolve the Workbench versus Focus choice; token tuning does not authorize feature removal.
2. Measure current build payload and capture current workflow fixtures. Create a separate implementation change/branch boundary without discarding existing local work.
3. Implement foundation and shell; migrate discovery/details, application management and dashboard, then all remaining surfaces.
4. Complete the coverage matrix, focused behavioral tests, one broad verification per unchanged candidate and the browser matrix. Keep resources under the owner's runner/cleanup policy.
5. Obtain review of the concrete candidate. Build static assets locally and use the existing versioned deployment procedure after deployment authorization. No database migration is expected.
6. Roll back by selecting the prior static release if acceptance fails. Preserve backend containers, database records, stored preferences and email configuration. Verify HTML/asset version consistency to prevent mixed-release caches.

## Open Questions

- Workbench implementation and the concrete UI were accepted on 28 October 2026. The owner authorized production rollout; release 261028210616 is live with smoke/regression evidence and remaining broader checks recorded in implementation.md.
- DM Sans plus Manrope are self-hosted with OFL notices, alongside the retained wordmark subset, totaling 62,692 bytes. Shared inline SVG controls are implemented. The phone JS target passes; the wide inspector exceeds it with the narrowly reviewed WIDE-INSPECTOR-01 exception recorded in implementation.md.
- Physical-phone testing availability must be recorded before release; desktop emulation alone cannot prove device acceptance.

## References

- [Vercel Geist colors](https://vercel.com/geist/colors): neutral surfaces, semantic color roles and border strength.
- [Vercel Geist typography](https://vercel.com/geist/typography): consistent heading, label and copy styles.
- [Vercel Geist grid](https://vercel.com/geist/grid): predictable responsive composition; ordinary utility grids are appropriate for plain content.
- [Apple design principles](https://developer.apple.com/videos/play/wwdc2026/250/): hierarchy, consistency, flexibility and understandable actions.
- [OpenSpec workflow](https://github.com/Fission-AI/OpenSpec): proposal, requirements/scenarios, design and trackable tasks.
- [DM Sans source and OFL](https://github.com/googlefonts/dm-fonts): source/license evidence for the interface family.
- [Manrope OFL](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt): source/license evidence for the selected free heading family.
