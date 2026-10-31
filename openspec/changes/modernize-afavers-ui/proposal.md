## Why

Afavers has a useful job-search and application workflow, but competing colors, repeated dashboard totals, inconsistent controls and large filter sections make it harder to scan. On phones, the current expanded saved-search form can push the first vacancy below the initial viewport. A coherent visual system and task-focused layout will make the same capabilities easier to find and use.

## What Changes

- Introduce a restrained visual foundation inspired by Vercel's working interfaces and Apple's hierarchy: neutral surfaces, subtle borders, smaller corners, DM Sans interface text, Manrope headings and sparse green accents. Manrope is the free substitute selected after the owner requested an Object Sans alternative. Preserve the Afavers logo.
- Remove decorative template conventions and vague coaching copy. Use concise task labels and a few short spatial/feedback animations, with no generic fades, entrance choreography or decorative loops.
- Group navigation by task, simplify page headers and keep all existing destinations accessible.
- Replace oversized job cards with comparable result rows and a wide-screen detail inspector; retain dedicated job-detail routes and a full-screen phone detail flow.
- Consolidate filters and saved searches without removing any filter or silently changing its meaning.
- Organize application editing into Overview, Preparation and Activity sections; provide an accessible status control and a stage-focused phone board.
- Prioritize the next useful action on the dashboard while preserving configurable widgets, goals, calendar and insights.
- Apply the same controls and states to every secondary, public, onboarding and administration route.
- Establish explicit accessibility, localization, compatibility, performance, test and release gates.

This package contains interactive illustrative mockups and specifications only. It proposes no database, backend contract, matching algorithm or email-delivery changes. No production implementation or deployment is performed by preparing this proposal.

## Capabilities

### New Capabilities

These are newly specified interface contracts for an existing product, not claims that their underlying features are new.

- `ui-foundation`: Semantic tokens, typography, compact controls, themes and shared component states.
- `workspace-navigation`: Task-grouped shell, route compatibility and device-appropriate navigation.
- `job-discovery-workspace`: Comparable job results, filters, saved searches, selection and detail inspection.
- `application-workspace`: Application board, touch/keyboard status changes and private application editing.
- `action-dashboard`: Prioritized actions, consolidated summaries and retained optional widgets.
- `surface-coverage`: Consistent treatment of every secondary and public route.
- `experience-quality`: Accessibility, language, performance, regression and release acceptance.

### Modified Capabilities

None. The repository had no existing OpenSpec capability files when this change was created. Existing services, routes and tests remain the compatibility baseline; no requirement is implicitly removed by this new specification set.

## Impact

- Main implementation scope: `client/src/index.css`, `client/index.html`, `client/src/components/layout/AppLayout.tsx`, shared UI components and route page composition.
- Preserve `client/src/services/`, account-scoped stores and authorization wrappers as the source of data and behavior; extract view components around them.
- Reuse React, Tailwind, React Router and dnd-kit. A small tree-shaken icon package is an implementation option only if it meets the payload budget; no UI framework replacement is planned.
- No new production service, database migration, DNS change, mail configuration or hosting subscription is required.
- Design previews use explicitly illustrative vacancies and local state, without connecting to accounts or APIs.
- See `plan.md` for sequencing, `design.md` for technical decisions, `coverage.md` for feature preservation, and `tasks.md` for implementation work.
