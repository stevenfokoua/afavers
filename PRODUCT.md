# Afavers

<!-- impeccable:product-schema 1 -->

## Platform

web

The responsive web app also has a Capacitor wrapper and a companion browser extension. Desktop and phone are equally important; the wrapper does not introduce a separate native design language.

## Users

The owner and friends use Afavers to find jobs and manage their own applications. Existing feeds and interface support a German job-search context, with English and German interface languages.

## Product Purpose

Help a person discover relevant jobs, understand why a job matches, shortlist opportunities, prepare an application, and keep track of follow-ups and interviews in one place.

## Operating Context

Afavers is self-hosted at afavers.saintcreators.com on the owner's shared Saintcreators VPS. The server also runs other services and has approximately 4 GB RAM. Preserve efficient static frontend delivery and the existing self-hosted backend. The owner has explicitly excluded off-site backup work.

## Capabilities and Constraints

- Preserve job search, filters, sorting, freshness information, match explanations, saved searches and manual jobs.
- Preserve Hot Picks, the applications board, application statuses, private notes, cover-letter drafts, checklists, activity history, reminders, interviews, goals, analytics and export.
- Preserve news, interview preparation, configurable dashboard widgets, settings, email alerts, administration, demo mode, onboarding, authentication and password recovery.
- Preserve English/German, light/dark themes, phone safe areas, keyboard access, Capacitor and companion-extension behavior.
- Keep existing ownership and security boundaries: private account data must remain account-scoped. Do not change matching, deduplication, email delivery or data-retention behavior as a side effect of a UI redesign.
- Existing implementation: React, TypeScript, Vite, Tailwind, Zustand, React Router and self-hosted Supabase-compatible services; static production frontend.
- On 28 October 2026 the owner authorized implementation, accepted the concrete Workbench UI and explicitly authorized deployment. Release 261028210616 is live, with bounded regression evidence and rollback preserved.

## Brand Commitments

Keep the Afavers name and existing logo, including its recognizable wordmark. Use green sparingly. The owner requests an Apple/Vercel-inspired modernization: plain colors, fewer decorative gradients, smaller corner radii, better organization and consistent alignment.

Use DM Sans for interface/body text. The owner requested Object Sans for headings, then explicitly chose a similar free font instead of supplying licensed Object Sans files. Manrope is the selected free substitute. Preserve the existing wordmark as a brand asset. Remove decorative template patterns and use only a few short, purposeful animations; no generic page fades or decorative loops.

## Evidence on Hand

- Existing routes, stores and components in client/src/.
- Current-look desktop and phone captures in the chat workspace outputs/ and outputs/improvements/.
- Official Apple design principles and Vercel Geist colors, typography and layout documentation researched in this conversation.
- Previous deployment and test receipts are historical evidence, not fresh acceptance of a redesign.
- New mockup job records and counts must be visibly identified as illustrative; they are not live vacancies or measured product performance.

## Product Principles

1. Make finding and comparing relevant jobs quick on desktop and phone.
2. Make the next useful action and current application state clear.
3. Preserve every capability and private record while reorganizing the interface.
4. Prefer efficient, familiar interactions and consistent reusable components.
5. Keep proposed designs distinct from implemented or approved production behavior.

## Open Decisions

- Workbench, DM Sans, Manrope and restrained motion are the accepted, deployed direction. Broader device/accessibility/integration checks remain qualified in the release receipt.
- A standing image-first versus code-first preference has not been requested or recorded. This implementation is code-led, using the finalized interactive references.
