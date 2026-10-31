## ADDED Requirements

### Requirement: Complete route preservation
The redesign SHALL cover every route in coverage.md without removing its existing capabilities, access rules, URLs or data. Secondary pages SHALL use the same shared foundation and state vocabulary.

#### Scenario: Visiting a secondary page after using Jobs
- **WHEN** a person opens analytics, news, interview preparation, career guides or reminders
- **THEN** its existing functionality remains available and forms/actions use the shared interface patterns

### Requirement: Authentication and onboarding continuity
Landing, demo, signup, confirmation, login, password recovery/reset and onboarding SHALL retain their current contracts. Setup retries SHALL preserve choices and optional browser-storage failures SHALL not turn a completed server operation into a false failure.

#### Scenario: Retrying a failed setup request
- **WHEN** setup fails before completion and the person retries
- **THEN** previously entered choices remain and retry does not require restarting the flow

#### Scenario: Optional browser storage fails after successful setup
- **WHEN** the server has completed setup but a best-effort browser-storage write fails
- **THEN** the app still enters the completed flow using its existing fallback behavior

### Requirement: Settings clarity and behavior preservation
Settings SHALL group profile/search preferences, alerts, appearance/language and account actions with clear labels. Existing alert opt-in, thresholds, filters and delivery deduplication SHALL remain unchanged.

#### Scenario: Saving a named search
- **WHEN** a person creates a saved search without changing email settings
- **THEN** email alerts retain their prior opt-in state and delivery configuration

### Requirement: Companion and administrative compatibility
Capacitor notification/safe-area behavior, browser-extension integration, manual entry/import, exports and administrator operations SHALL remain compatible. Administrator safeguards SHALL not be weakened by reorganized navigation.

#### Scenario: Opening an extension-provided job link
- **WHEN** the companion extension opens an existing supported Afavers URL
- **THEN** it reaches the same authorized workflow after the redesign

### Requirement: Illustrative prototype boundary
Design previews SHALL label synthetic jobs/counts, keep changes local, avoid live account/API/email operations and describe unimplemented production behavior honestly.

#### Scenario: Applying from a design preview
- **WHEN** a reviewer activates Apply in an illustrative preview
- **THEN** it clearly indicates preview behavior and does not submit an application, alter a live account or contact an employer
