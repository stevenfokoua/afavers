## ADDED Requirements

### Requirement: Complete application lifecycle
The board and detail editor SHALL preserve new, saved, preparing, applied, followup, interviewing, offered, rejected and archived statuses and their existing semantics. Hiding SHALL remain separate from status.

#### Scenario: Accessing less frequent stages
- **WHEN** a person chooses offered, rejected or archived on phone or desktop
- **THEN** that stage remains selectable and its applications remain reachable

### Requirement: Accessible board transitions
Application stage changes SHALL be possible by labeled controls with keyboard and touch, independently of desktop dragging. Phone layouts SHALL provide a readable selected-stage list and counts.

#### Scenario: Moving an application without dragging
- **WHEN** a keyboard or touch user changes a card's stage through its status control
- **THEN** the same authorized update occurs as with a drag operation and the result is announced

### Requirement: Shared private application editor
Details opened from discovery, the board or reminders SHALL use one consistent editor for existing dates, checklist, private notes, cover-letter draft and activity history. The UI SHALL preserve each field's save behavior and sanitizer/authorization boundaries.

#### Scenario: Opening the same tracked job from a different route
- **WHEN** a person opens an application from the board after editing its private notes in details
- **THEN** the editor shows the same authorized notes and state

### Requirement: Draft and failure recovery
Pending, saved and failed mutations SHALL have distinct feedback. Failed private edits SHALL remain recoverable, failed optimistic status changes SHALL roll back, and leaving dirty unsaved content SHALL provide a recoverable choice.

#### Scenario: Saving notes fails
- **WHEN** a private-note save request fails
- **THEN** the draft remains available, an error identifies retry and the UI does not claim the notes were saved

#### Scenario: A stage update is rejected
- **WHEN** an optimistic application-stage update fails
- **THEN** the previous stage is restored and the failure is visible without losing other private fields

### Requirement: Account isolation
The editor SHALL clear account-bound data on logout/account change and SHALL NOT transfer notes, drafts, cached jobs, reminders, goals or preferences between accounts.

#### Scenario: Signing into another account after logout
- **WHEN** account B signs in after account A leaves
- **THEN** account A's private drafts and cached application data are not visible to account B
