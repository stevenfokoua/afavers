---
name: Afavers
description: A flat, aligned workbench for finding jobs and managing applications.
colors:
  canvas: "#fafafa"
  surface: "#fff"
  subtle: "#f4f5f5"
  hover: "#eef0f1"
  ink: "#181b1f"
  on-ink: "#fff"
  muted: "#58616c"
  line: "#e2e5e8"
  strong-line: "#89929d"
  accent: "#067647"
  accent-soft: "#edf8f1"
  danger: "#b42318"
  danger-soft: "#fff1f0"
  warning: "#854d0e"
  logo-orange: "#f97316"
  dark-canvas: "#111315"
  dark-surface: "#181a1d"
  dark-subtle: "#202327"
  dark-hover: "#2b2f34"
  dark-ink: "#f3f4f5"
  dark-on-ink: "#181b1f"
  dark-muted: "#b0b6bf"
  dark-line: "#363b42"
  dark-strong-line: "#737d89"
  dark-accent: "#75dda6"
  dark-accent-soft: "#153626"
  dark-danger: "#ffb4ac"
  dark-danger-soft: "#40201e"
  dark-warning: "#f1cd8c"
typography:
  display:
    fontFamily: "Manrope, 'DM Sans', system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, 'DM Sans', system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "34px"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, 'DM Sans', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
    letterSpacing: "-0.025em"
  body:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  metadata:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  row-title:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "22px"
  wordmark:
    fontFamily: "'Afavers Wordmark', Manrope, 'DM Sans', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    letterSpacing: "-0.04em"
rounded:
  button: "3px"
  filter: "4px"
  control: "3px"
  panel: "4px"
  linked-card: "2px"
  navigation: "6px"
spacing:
  compact: "4px"
  control-gap: "8px"
  row-gap: "12px"
  group: "16px"
  row: "20px"
  section: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  nav-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.navigation}"
    padding: "9px 12px"
  filter-chip:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.filter}"
    padding: "5px 8px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  job-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "20px"
  board-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: Afavers

## Task-specific cards

The card family uses the current 2–4px corners, DM Sans/Manrope and semantic theme tokens. Structure expresses purpose:

- Job results share one bordered list with dividers; role/company lead, location/salary align opposite on desktop and stack on phone. Titles allow two phone lines.
- Application cards keep company, role, notes, next action, relevant dates and stage controls together. Status transitions and drag handles retain their existing behavior.
- Agenda action cards use a calendar date block, task type, company, role and one named action. Overdue is a text label and never color alone. Device reminders reuse the date treatment.
- Hot Picks presents one featured opportunity with a larger title, plain supporting metadata and supplied match reasons/gaps. Absent scores and absent explanations are omitted.
- Related dashboard modules, metrics and settings share grouped surfaces with internal separators. Metrics remain actionable; widget visibility/order and settings save boundaries remain intact.

Hover feedback uses short background transitions. Existing details, save and board movement remain interruptible; reduced motion disables decorative transitions and Hot Picks movement. No new service, request, dependency or backend schema is needed for these layouts.

## Overview

**Creative North Star: "Workbench"**

Afavers is a calm digital workspace for comparing opportunities and acting on them. Neutral surfaces, aligned rows, readable metadata and compact controls give the content priority. The accepted Operate direction treats desktop and phone as equal working contexts.

The interface uses a flat white/gray/charcoal palette, sparse functional green and restrained corners. DM Sans carries interface text and data; Manrope supplies headings. The existing orange-v wordmark remains the identity anchor. Decorative gradients, invented eyebrows and ornamental dashboard furniture are outside this chosen direction.

**Key Characteristics:**

- Aligned comparison rows and thin separators.
- Neutral primary actions with sparse green state cues.
- Small control corners and slightly softer panels.
- Dedicated phone layouts with the same visual vocabulary.
- Brief, interruptible feedback tied to an action.

This scan records the current candidate from `client/src/styles/tokens.css`, `client/src/styles/workspace.css`, `client/src/index.css` and sampled UI, workspace, job, board and public components. It is code-led; the interactive OpenSpec references are directional, with no approved raster comp. The final finish verdict covers six scored corrections only. It does not establish whole-surface, production, physical-device, actual 200% zoom or complete accessibility/integration acceptance.

## Colors

The palette is cool neutral paper and charcoal, with functional green, error red and warning amber. Values in the frontmatter retain the source CSS notation; dark-prefixed entries record the corresponding `.dark` overrides rather than a second independent palette.

### Primary

- **Charcoal / On Charcoal** (`ink` / `on-ink`): primary button fills and their text, primary reading text and selected tab underlines. The roles invert in dark mode.
- **Working Green / Quiet Green** (`accent` / `accent-soft`): active navigation, match information, focus outlines, links in job prose, native check accents and board drop targets. Green is sparse; the standard primary button is charcoal.

### Secondary

- **Error Red / Quiet Error** (`danger` / `danger-soft`): error text, destructive button text and inline error surfaces. Destruction is not expressed by an unexplained red icon alone.
- **Warning Amber** (`warning`): cautionary information on existing feature surfaces.
- **Wordmark Orange** (`logo-orange`): the lowercase v in the preserved wordmark. It is an identity detail, not another action color.

### Neutral

- **Canvas** (`canvas`): page and shell backdrop.
- **Surface** (`surface`): navigation, panels, fields, rows and dialogs.
- **Subtle** (`subtle`): selected job rows, filter chips and quiet group surfaces.
- **Hover** (`hover`): secondary/quiet control and navigation hover treatment.
- **Muted** (`muted`): metadata, field labels, secondary reading text and placeholders.
- **Line** (`line`): structural separators and panel boundaries.
- **Strong Line** (`strong-line`): form-control boundaries.

**The Functional Green Rule.** Use green for meaningful state, matching and focus; keep ordinary primary actions neutral.

**The Role Inversion Rule.** Theme through the semantic CSS variables. Do not hard-code white text on a primary button: the dark theme uses dark `on-ink` text on light `ink`.

## Typography

**Display / Heading Font:** Manrope, followed by DM Sans and system sans fallbacks. It is the selected free substitute for Object Sans.

**Body / UI / Data Font:** DM Sans, followed by system sans fallbacks. There is no separate monospace data face.

**Wordmark Font:** the preserved Figtree-based `Afavers Wordmark` asset, restricted to the identity. Local font files use swap loading; available declared weights are DM Sans (400–600), Manrope (500–600) and wordmark (800).

**Character:** Compact and straightforward rather than editorial. Headings have slight negative tracking; data and interface labels stay in DM Sans. This is a practical hierarchy, not a single mathematical type scale.

### Hierarchy

- **Display:** public landing headline uses Manrope semibold with tight line-height (0.95), stepping from the frontmatter base at the public small breakpoint (60px from 640px) to the large breakpoint (96px from 1024px). This scale belongs to public presentation, not workspace headings.
- **Headline:** workspace page headings use the frontmatter headline; on phone they reduce to (25px / 32px).
- **Title:** job details use the frontmatter title; phone uses (23px / 31px). Dialog headings are (20px); compact section and empty-state headings use (18px).
- **Body:** job prose uses the frontmatter body role, wrapping within (70ch). Most interface reading text is (14px / 20px), with contextual (13px) labels and company metadata.
- **Label:** controls use the label role. Navigation is (14px / 22px), reducing to (13px) in the intermediate rail range. Form labels are (13px), metadata (12px) and phone bottom-navigation labels (11px / 16px).
- **Row title:** job titles deliberately use DM Sans semibold, not the heading face. Summary figures and tab counts use tabular numerals where explicitly applied.

**The Two Voices Rule.** Keep Manrope on actual headings and DM Sans on controls, body and data. Do not replace the wordmark with either face.

## Layout

The workspace is a fixed navigation edge plus a flexible content region. Page content centers inside a maximum (1440px) width with desktop page padding (32px), intermediate padding (24px), and phone padding (22px vertically / 16px horizontally). Reused spacing steps are recorded above; the implementation also uses contextual gaps and padding, so this is not a rigid all-values-must-be-multiples rule.

| Viewport / condition | Implemented behavior |
| --- | --- |
| At most 360px | Jobs controls become a two-column grid; sorting occupies a complete row. |
| At most 767px | Sidebar disappears; header is (56px) high; fixed bottom navigation is at least `calc(64px + env(safe-area-inset-bottom,0px))`. Main content reserves that height. Forms and filters become one column. Jobs open dedicated details; application cards use a selected-stage list. |
| 768–1199px | Sidebar collapses to (72px), matched by the main content margin. Its toggle expands it to (208px) and restores labels. Collapsed links retain accessible labels and titles. The source's earlier (184px) declarations are overridden and are not the effective design. |
| From 1200px | Sidebar is (208px). Jobs use a list/inspector grid: `minmax(340px,.9fr) minmax(380px,1.1fr)`. Inspector sticks at the top, scrolls inside a maximum (100dvh), and has a left separator. |
| Coarse pointer | Shared buttons, links in the app rail, tabs, checks and fields receive minimum height (44px). |

Public pages additionally use Tailwind small (640px) and large (1024px) responsive typography. These do not change the workspace rail breakpoints.

Job rows have desktop padding (20px), wide-list padding (22px), and phone padding (18px vertically / 14px horizontally). Details have desktop padding (28px) and phone padding (20px vertically / 16px horizontally). A full detail page is capped at (960px). Dashboard summaries are five aligned columns on desktop and three on phone; the agenda is a row list with dates, a flexible main column and a trailing action that wraps below on phone.

The application board owns its horizontal overflow, using columns (256px) wide before user zoom, with gaps (16px). It is replaced by the stage-selected list on phone. Jobs tabs own horizontal tab scrolling. Body and flexible children use zero minimum width; do not reinstate a root minimum that causes horizontal page scrolling. Jobs return navigation preserves the search URL, selection and list scroll context.

## Elevation & Depth

The canonical workspace has no box shadows. Boundaries come from neutral tonal changes and thin borders (1px); a selected job row changes tone rather than lifting. Native dialogs establish modality with a dark backdrop (`rgb(0 0 0/.45)` for the shared dialog and `rgb(0 0 0/.5)` for the modal surface). The fixed rail, bottom navigation and toast layers have functional stacking; they are not decorative cards.

**The Flat Workbench Rule.** Use surface tone and separators for hierarchy. Shared buttons, rows and panels do not gain decorative lift or offset shadows.

## Shapes

Buttons use the button radius; inputs use the control radius, navigation links retain the navigation radius, and panels, application cards and dialogs use the panel radius. Linked/clickable vacancy cards use the linked-card radius because their previous button-like corners were already halved. Filter-removal chips are the small rectangular exception. Avoid enlarging radii into a pill-based visual language. Public CTAs use half their previous corner radius (4px for former 8px corners); other button-like rounded links follow the same halving. Cards and fields also halve their previous corners, while existing action buttons retain the earlier refinement.

The icon system is inline stroke SVG, normally (18px), with a (24 × 24) viewBox, current-color stroke (1.75), and rounded caps and joins. Decoration does not require an invented icon tile or glyph. Preserve the orange-v silhouette and the existing logo assets rather than redrawing the identity.

## Components

### Buttons

Compact rectangular controls with an explicit action label. The shared variants are primary, secondary, quiet and danger. Their frontmatter entries give fill, text, corners and padding. They have a thin border, an internal gap (8px), and desktop minimum height (36px). Phone and coarse-pointer shared buttons use (44px); phone page-header buttons reduce horizontal padding (10px) and font size (13px). The stylesheet's minimum height is not a claim that every legacy/custom target has been audited.

Secondary and quiet hover use `hover`; primary hover retains `ink` with a brightness filter (0.9); danger changes text to `danger`. Disabled buttons use opacity (0.5) and the disabled cursor. `busy` disables the button and exposes `aria-busy`. Icon-only shared actions have accessible labels; coarse-pointer `.ui-icon-button` has minimum width (44px).

### Chips

Active filters use a subtle fill, small rectangular corners, text (12px), gap (8px) and a remove button with an inline close SVG (14px). The removal action carries the filter name/value in its accessible label. This is a compact filter annotation, not a decorative badge system.

### Cards / Containers

Panels use surface, a line border and panel corners. The generic panel adds no default internal padding: the content decides spacing. Application cards add padding (16px), margin below (12px), a DM Sans title (14px / 22px) and muted company/location metadata. They contain an explicit stage select, so drag is not the sole way to change status. On desktop the board offers pointer and keyboard sensors and drag announcements; on phone it offers a normal stage-selected list.

### Inputs / Fields

Fields use surface, ink and the stronger border, with control corners, full available width, padding (8px vertically / 10px horizontally) and desktop minimum height (38px). Shared fields are (14px / 20px) on desktop, (16px) on phone; compact sort/status and board fields have documented local overrides. Coarse-pointer fields reach minimum height (44px). Disabled fields use opacity (0.6). Labels are visible where provided or attached via `aria-label`; the source does not establish a global custom invalid-border state.

The global keyboard outline is (2px) green with offset (3px). The search wrapper uses the same thickness and offset (2px) on `focus-within`, while its input's own outline is removed. Do not remove the wrapper focus treatment when reusing the search input.

### Navigation

The rail groups Search, Track and Resources; active links use quiet green with green text and medium weight. Normal text is muted, hover switches to ink on hover tone. The effective rail widths and phone replacement are specified in Layout. The phone bar has four direct destinations and More; More opens a native dialog. A keyboard-visible skip link leads to main content. Preserve route labels when the intermediate rail hides visible text.

### Job comparison rows / details

Job rows present title, company/location, match and source/freshness in recurring positions, with a separate save action. Selection uses subtle tone; tab selection uses an ink underline (2px), not a raised pill. Wide-screen details are an inspector; phone details are a dedicated route. Prose wraps long words, limits image/table width and gives tables their own overflow.

### Dialogs / feedback

Shared dialogs use panel corners and padding (24px desktop / 20px phone), width `min(560px,calc(100% - 32px))`, bounded height and internal scrolling. The wide modal surface is capped at (1100px). The React components invoke native `showModal`, label the dialog, handle Escape via cancel and return focus to the triggering element on cleanup. Inline errors use `role="alert"`; loading/empty content and toast semantics remain explicit. Toasts use alerts for errors and status for other messages, include dismissal and sit above phone navigation.

### Motion

The shared action helper uses `cubic-bezier(.2,.8,.2,1)`. A selected detail settles laterally from (8px) over (180ms); successful save feedback scales from (0.92) back to (1) over (120ms); a board reflow uses position-delta translation to zero over (180ms). Detail movement is tied to user selection. A new helper animation cancels the previous animation on the same element. Reduced-motion preference skips helper animation, and the global media query disables CSS animations/transitions and smooth scrolling immediately. Default shared button states do not introduce a generic page fade.

These are the canonical helper patterns, not a claim that every dependency animation or local public demonstration follows them. Do not extend residual generic CSS transitions, drag-library animation defaults or illustrative swipe demonstrations into new motion rules.

## Do's and Don'ts

### Do:

- **Do** use semantic color variables so the same component follows the light and dark role assignments.
- **Do** keep comparison content aligned in rows and reserve panels for actual grouped content.
- **Do** use DM Sans for UI/body/data and Manrope for headings; preserve the orange-v wordmark.
- **Do** keep buttons at the button radius, fields at the control radius and containers at the panel radius.
- **Do** preserve visible keyboard focus, meaningful control labels and an explicit status-menu alternative to dragging.
- **Do** adapt navigation, forms, job details and the application board to the implemented phone layouts.
- **Do** tie the three shared motion patterns to their actions and honor immediate reduced-motion behavior.

### Don't:

- **Don't** turn sparse green into a full-page brand wash or recolor every primary action green.
- **Don't** add decorative gradients, invented eyebrows, ornamental category numbering or generic dashboard icon tiles.
- **Don't** replace flat surfaces with floating shadow cards or pill-shaped controls.
- **Don't** apply the public display headline scale to dense workspace headings or comparison rows.
- **Don't** hide navigation labels without retaining accessible names or force a desktop board onto phone.
- **Don't** introduce decorative loops, generic page fades or motion that delays an action.
- **Don't** treat a local scan or the six-fix finish verdict as complete route, device, accessibility or production acceptance.

Not canonized: unimported Vite starter `App.css`, the legacy blue/animation entries in `tailwind.config.js`, local public glyphs, residual generic transitions and error-boundary inline fallback colors are not reusable design-system rules. They are unused scaffolding or implementation exceptions; documenting them as house style would contradict the accepted Workbench direction. Functional installation-step numbers remain legitimate local content rather than a reusable decorative numbering system.
