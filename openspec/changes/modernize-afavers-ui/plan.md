# Afavers UI/UX overhaul plan

Plan finalized for typography, copy and motion, then authorized for implementation on 28 October 2026. The owner subsequently accepted Workbench and authorized deployment. Release 261028210616 is live at afavers.saintcreators.com; [implementation.md](implementation.md) records the reviewed exceptions, deployment evidence and remaining broader acceptance checks.

## Outcome

A person can find and compare suitable jobs, understand the next application action and manage their progress comfortably on desktop and phone. The same features remain available in a calmer, more coherent workspace.

## Recommended direction

Keep the name and logo. Use neutral surfaces, clear text, restrained green, 6px controls, 8px panels and consistent spacing. Pair DM Sans for body/controls with Manrope for headings; Manrope is the selected free substitute for Object Sans. Use Vercel's control discipline and Apple's information hierarchy at a density appropriate to job-search work. Workbench is the recommended layout; Focus is an alternative to compare in the preview.

Remove decorative template patterns: gradients/glass/glows, nested cards, company-initial tiles, gratuitous badges, oversized metric displays and generic coaching taglines. Keep real features and useful context. Use three concise animations only: detail selection (180ms lateral settle), saved confirmation (120ms compression/return) and application movement (180ms FLIP, maximum 200ms). No generic fades, page-load reveals or decorative loops. Reduced motion keeps state feedback with instantaneous movement.

## Preview scope

The interactive design previews illustrate job browsing, selection/details, preparation/activity, the dashboard, application stages and settings. Job records, counts and activity are synthetic and explicitly labeled. Filters, status changes, notes and preferences operate only within the preview. They do not access the live backend or send email.

## Delivery sequence

| Phase | Deliverable | Exit evidence |
| --- | --- | --- |
| Design review | Desktop/phone Jobs, details, dashboard and application previews; coverage matrix | Representative layout and behavior accepted; unresolved visual choices named |
| Baseline and foundation | Payload baseline, tokens, small shared components, font/icon strategy | Both themes and control states reviewed; baseline retained |
| Shell and discovery | Grouped navigation, compact toolbar, saved searches, rows, route-aware details | Phone sees first result promptly; search/back/deep links and all filters retain behavior |
| Application management | Shared editor, dates, preparation/activity, accessible board/stage list | Notes/drafts/status/history and keyboard/touch flows pass |
| Dashboard and secondary routes | Prioritized agenda plus complete route coverage | Every row in coverage.md has implementation and verification evidence |
| Candidate acceptance | Browser matrix, behavior suite, payload comparison and review | Quality gates below pass on the exact candidate |
| Authorized rollout | Existing versioned static deployment and smoke checks | Correct release served; preserved auth, API, email and private records; prior assets available for rollback |

## Release acceptance

- No feature or existing URL lost; private records, stored searches/preferences and ownership preserved.
- At 390x844, the default Jobs view shows the start of at least one result within 420 CSS pixels from the top, excluding optional expanded panels and system/browser chrome.
- No page-level horizontal overflow at 320, 390, 768, 1024 and 1440 CSS pixels; two-dimensional desktop board scrolling is contained and a phone stage view exists.
- EN/DE and both themes pass long-title, empty, loading, failure, focus, zoom and touch checks. Body contrast is at least 4.5:1 and non-text interactive indicators at least 3:1 where applicable.
- Existing behavior tests pass plus meaningful new interaction/parity tests. Historical test counts are not substituted for a fresh candidate run.
- Initial-route gzip JavaScript increase stays within 10 KiB of a freshly measured baseline; UI font transfer at most 100 KiB; no new resident production service.
- DM Sans and Manrope roles, self-hosted font/license delivery and the three bounded motion effects match the specification; no synthetic font weights, generic fades or queued animations.
- Preview validation proves only the preview. Implementation, accessibility audit and physical-device results must be recorded separately before release.

## Technical package

- `proposal.md`: rationale, scope and capability list.
- `design.md`: implementation architecture, tokens, compatibility, risks and rollout.
- `specs/*/spec.md`: normative requirements and concrete scenarios.
- `coverage.md`: existing feature-to-redesign mapping and regression obligations.
- `tasks.md`: dependency-ordered implementation checklist with bounded local evidence and remaining acceptance gates.
- `preview-validation.json`: bounded inspection evidence for these illustrative mockups, when completed.

## Decision status

Confirmed: product purpose, feature preservation, self-hosting, logo/name, sparse green, Apple/Vercel reference direction, equal desktop/phone priority, DM Sans plus a free Object Sans substitute, concise purposeful motion and planning/mockup/specification scope. The selected free substitute is Manrope.

Accepted and deployed: Workbench with wide-screen inspector and full-screen phone details, semantic CSS tokens, self-hosted DM Sans/Manrope and a small reusable component layer.

Delivered: the accepted Workbench UI, independent review, production build and live release 261028210616, with source/baseline preservation and bounded browser/backend regression evidence. Remaining broader device, accessibility, integration and email coverage is explicitly qualified in the deployment receipt.
