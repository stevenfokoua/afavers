# afavers — Review

Two documents, written April 2026 as input to the monetise / shelve / pivot decision.

- **[code-review.md](./code-review.md)** — technical and UX review of the live codebase. Executive summary, architecture, feature-by-page grading, security and compliance, scalability, observability, testing, dependencies, and a prioritised P0 / P1 / P2 punch list with file:line references.
- **[market-report.md](./market-report.md)** — commercial viability research. ICP ranking, market sizing, regulatory landscape, competitor teardown with pricing, voice-of-customer synthesis, willingness-to-pay benchmarks, differentiation audit, three GTM scenarios (B2C freemium / B2B to Jobcenter-BAMF / Chancenkarte niche), recommended path, and a 30-day action checklist.

## How to read them

Start with the **executive summary** of each (both are at the top of their respective docs). If you have ten minutes, read those two summaries plus `market-report.md` §"Recommended path + 30-day actions". That's the decision-critical surface.

The two documents are intentionally cross-linked. Every GTM scenario in the market report lists its prerequisite build work as references into the code-review punch list, so you can cost each path by skimming back the other way.

## What the review does not do

- It does not implement any punch-list fixes.
- It does not add monetisation infrastructure (Stripe, tiers, paywalls).
- It does not run customer interviews — that is the first action in the 30-day plan, and it is yours to run.
- It does not re-do the UX walkthrough in a browser; `code-review.md` §9 lists the exact flows to walk before a paid launch.
