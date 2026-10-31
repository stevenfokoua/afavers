# Afavers implementation review packet

Request: “implement the plan.” The approved OpenSpec direction modernizes the whole job-search app, preserving features. Keep the Afavers name/logo, sparse green, plain colors, smaller corners, alignment and organization. DM Sans is the UI/body font; Manrope is the accepted free Object Sans substitute. Desktop and phone are equally important. Remove decorative template patterns and use a few concise, purposeful animations, excluding generic fades. Static frontend on a shared 4 GB VPS; no new production service. This candidate is local and has not been deployed.

Project/artifact: `C:/Users/Nah.STEVEN/Documents/Projects/afavers`.

Read `PRODUCT.md`, `.impeccable/briefs/workspace.md`, `openspec/changes/modernize-afavers-ui/design.md` and `coverage.md` for the direction contract, scope and feature inventory. Code-led Workbench implementation; the decision references are `openspec/changes/modernize-afavers-ui/mockups/desktop.html` and `phone.html`, not pixel-approved raster comps. No comp-diff claim is made.

## Required evidence

All files are in `.impeccable/review/` and have been opened to validate their content. Full-page captures retain fixed navigation at the viewport position; it appears partway down long full-page images for this reason.

- `desktop.png`, `mobile.png`, `user-1280.png`: working Jobs route at 1440, 390 and actual user width 1280.
- `jobs-320.png`, `jobs-768.png`, `jobs-1024.png`: responsive checks.
- `dashboard-desktop.png`, `dashboard-mobile.png`: agenda and all retained widget capabilities.
- `board-desktop.png`, `board-mobile.png`: includes successful explicit stage change and confirmation.
- `settings-dark-desktop.png`, `settings-dark-mobile.png`: German settings in dark mode.
- `dark-desktop.png`, `dark-mobile.png`: German Jobs in dark mode.
- `login-desktop.png`, `login-mobile.png`: focused auth forms.
- `landing-desktop.png`, `landing-mobile.png`: complete public surface.
- `landing-desktop-hero.png`, `landing-mobile-hero.png`: legible first viewport of the same public surface.
- `browser-metrics.json`: no page overflow at tested widths; 390px first result starts at 389.6px, within the 420px gate.
- `route-smoke.json`: remaining routes rendered with synthetic local fixtures. No signup/email/admin actions were executed.

Screens are actual production components under an isolated, ignored `.local/ui-qa` transport with synthetic jobs. They are not live vacancies or production metrics. Preserve that distinction. Browser flows verified native More/filter dialogs and Escape focus return, consecutive location/date updates, rapid search-to-detail/back with restored query and result focus, dirty-exit protection, retained notes and successful save, and a non-drag stage transition. Backend/live auth, physical Capacitor devices and actual 200% browser zoom are not verified here.

## Quality bar and known boundaries

- Operate mode: compare jobs, inspect, prepare, track and follow up with clear controls and stable return context. Persuade mode only on the public page.
- Neutral flat surfaces, 6px controls, 8px panels; sparse green; DM Sans/Manrope; retained wordmark.
- Every original route and protected/admin boundary remains; no backend changes from this UI work. All nine statuses remain selectable.
- Motion: detail 180ms lateral settle, save 120ms compression/return, board FLIP 180ms; reduced-motion cancellation and no decorative loops. Existing functional swipe interaction remains.
- Fresh test/type/build logs live at `C:/Users/Nah.STEVEN/Documents/Codex/2026-10-27/pull-this-repo-x20/outputs/ui-implementation/`. The newest check is running after lazy-copy/pane packaging changes; read `verification.json` and `payload.json` when present, rather than assuming old results apply.
- Fonts total 62,692 bytes including the preserved wordmark subset. No Google Fonts runtime request.
- Earlier payload measurement exceeded the +10 KiB initial-JS target because the new Data Router and sanitized inspector add code. Route-owned copy and the phone detail editor are now deferred. Judge the final measured payload honestly. Any remaining budget exception must be explicitly named and justified; do not silently treat a failed budget as passing.
- Lint has historical errors. `baseline-lint.json` and candidate lint logs support comparison; a lint failure is not a pass.
- Detector ran once on `client/src`; `detector.json` lists eight warnings. Subsequent mechanical changes replaced popup/export fonts and static border-ring loaders. Do not rerun the detector. Source-check whether anything remains material.
- Existing raster assets were retained from this repository; no new shipping raster artwork was created. Screenshots are review evidence.

Craft floor: `C:/Users/Nah.STEVEN/.agents/skills/impeccable/reference/craft-floor.md`.

Review the concrete candidate without modifying production files. Follow the shipped finish reviewer contract. Save the report as `.impeccable/review/finish-review.md` and return the disposition and five required contract sections. Scope approval accurately; do not claim production acceptance or unexecuted browser/backend checks.
