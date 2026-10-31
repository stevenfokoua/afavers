## ADDED Requirements

### Requirement: Responsive and language acceptance
Every release candidate SHALL be checked at 320, 390, 768, 1024 and 1440 CSS-pixel widths in EN/DE and both themes, including long job titles, large counts, empty/loading/error states and 200% browser zoom. Page-level horizontal overflow SHALL not occur; a desktop board's necessary scrolling SHALL be contained and have a phone stage alternative.

#### Scenario: Long German title on a phone
- **WHEN** a job title spans multiple lines at 320 CSS pixels
- **THEN** title, company, state and essential controls remain readable without overlapping the navigation or overflowing the page

### Requirement: Accessible interaction acceptance
Normal text and placeholders SHALL meet 4.5:1 contrast; large text SHALL meet 3:1; necessary non-text control indicators SHALL meet 3:1 where applicable. Interactive controls SHALL have names, visible keyboard focus, logical order and essential actions without hover. Coarse-pointer targets SHALL provide approximately 44x44 CSS-pixel effective areas without overlap.

#### Scenario: Completing a workflow using only a keyboard
- **WHEN** a person filters jobs, opens details, saves a note and changes status without a pointer
- **THEN** every action is reachable, current state is perceivable and focus is restored after transient UI closes

### Requirement: Frontend efficiency budget
A release candidate SHALL retain lazy route loading and static production delivery, add no resident production service, and compare payload against a fresh equivalent baseline. Initial-route gzip JavaScript growth SHALL not exceed 10 KiB and new UI font transfer SHALL not exceed 100 KiB without a named reviewed exception.

#### Scenario: An optional chart or map is not visible
- **WHEN** a person initially opens job discovery
- **THEN** unrelated chart/map code is not pulled into the shared initial route solely by the shell redesign

### Requirement: Meaningful regression evidence
Acceptance SHALL include the existing behavioral suite plus focused new interaction/parity tests, browser smoke flows on the exact candidate, payload results and a complete coverage matrix. Planning/prototype checks SHALL not be reported as production acceptance.

#### Scenario: A mockup passes browser inspection
- **WHEN** the prototype's controls and layouts pass inspection
- **THEN** the report identifies it as prototype evidence and leaves implementation/release acceptance outstanding

### Requirement: Reversible authorized release
Deployment SHALL use the existing versioned static release procedure only after authorization of the concrete candidate. Rollback SHALL restore prior frontend assets without deleting backend records, preferences or production containers.

#### Scenario: A release smoke test fails
- **WHEN** the candidate serves mixed assets or breaks a required workflow
- **THEN** the prior static release can be restored and backend data remains intact

### Requirement: Resource-safe verification
Local helpers and heavy checks SHALL follow the supplied resource-ownership policy. Temporary services SHALL be registered with owner identity and creation identity, stopped after verification, and included in the task receipt. Existing shared processes and data SHALL not be adopted or removed.

#### Scenario: A preview server is no longer needed
- **WHEN** mockup inspection is complete
- **THEN** only the task-owned preview process is stopped and the final receipt accounts for its cleanup
