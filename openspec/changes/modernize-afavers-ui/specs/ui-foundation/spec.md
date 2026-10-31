## ADDED Requirements

### Requirement: Semantic visual system
The interface SHALL use a shared semantic system for surfaces, text, borders, spacing, radii and interactive states. The Afavers name and recognizable existing logo SHALL remain. Green SHALL be reserved for selected context, primary workflow emphasis or meaningful positive state; decorative gradients SHALL NOT be used in working screens.

#### Scenario: Equivalent controls on separate pages
- **WHEN** a person encounters the same action type on Jobs, Applications or Settings
- **THEN** its typography, geometry, emphasis and state feedback are consistent

### Requirement: Complete theme coverage
Every migrated route and overlay SHALL support the existing light and dark themes through semantic tokens, without unreadable hardcoded light surfaces.

#### Scenario: Switching theme with a panel open
- **WHEN** the theme changes while filters, details or a menu is open
- **THEN** the surface, text, borders and focus indicators update together without losing the current task

### Requirement: Shared control states
Shared controls SHALL define default, hover, focus, active, disabled, loading and error states as appropriate. Loading actions SHALL prevent duplicate submission and preserve a clear accessible name.

#### Scenario: Repeated click while saving
- **WHEN** a save request is pending and a person activates the same save control again
- **THEN** only the existing request proceeds and pending feedback remains perceivable

### Requirement: Typography and localization resilience
Body text, form text and supporting metadata SHALL remain legible with the proposed scale, font fallback, German characters and long content. Phone editable fields SHALL be at least 16 CSS pixels.

#### Scenario: Font resource is unavailable
- **WHEN** the interface font cannot load
- **THEN** fallback text stays readable and no control or essential label becomes clipped or inaccessible

### Requirement: Purposeful motion
State transitions SHALL honor reduced-motion preferences, preserve visible content and never delay an action for decorative choreography. Motion SHALL be limited to a 180ms detail-content lateral settle, 120ms saved-confirmation compression/return and a measured application-card FLIP move of 180ms, with an absolute ceiling of 200ms. Superseded animations SHALL be cancelled. Generic opacity fades, fade-and-rise entrances, scroll reveals, decorative loops, floating cards, bounce and count-up animations SHALL NOT be used.

#### Scenario: Reduced motion is enabled
- **WHEN** a person opens details or changes an application stage with reduced motion enabled
- **THEN** the complete state change is understandable without spatial animation

#### Scenario: Repeated job selection
- **WHEN** a person selects another job before the detail animation finishes
- **THEN** the old animation is cancelled and the current selection completes without queued movement or stale content

#### Scenario: Editing a private note
- **WHEN** a person types in the preparation editor or the app rerenders without a new selection
- **THEN** the details do not replay an entrance animation and editing focus remains stable

### Requirement: Named font roles and free delivery
The app SHALL use DM Sans for body text, controls, result titles and data, and Manrope for page/section/detail headings. Manrope SHALL replace the earlier Object Sans request as the selected free alternative. Production SHALL self-host the required WOFF2 assets with their OFL/copyright notices, supported German glyphs, visible text during load and no synthetic weights. The existing logo SHALL retain its identity as a brand asset.

#### Scenario: A localized working screen loads
- **WHEN** an English or German working screen loads with fonts available
- **THEN** its heading and interface text use their designated families and only required assets/weights are requested

### Requirement: Restrained product presentation
Working screens SHALL use aligned text, useful counts, ordinary controls and neutral separators. Decorative gradients/glass/glows, nested card shells, generic motivational taglines, decorative initial tiles, fabricated proof and filler sections SHALL NOT be introduced. Real analytics, goals, widgets and their capabilities SHALL remain available.

#### Scenario: Simplifying the dashboard
- **WHEN** a decorative tile or repeated tagline is removed
- **THEN** the underlying goal, application count, widget or navigation capability remains available with direct task-oriented labels
