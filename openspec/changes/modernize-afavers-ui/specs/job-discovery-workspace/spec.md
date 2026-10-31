## ADDED Requirements

### Requirement: Comparable result rows
Each result SHALL show its job title, company, location/work arrangement and understandable match/freshness information in a consistent hierarchy. Save SHALL remain directly accessible. Opening the listing SHALL remain distinct from changing application status.

#### Scenario: Opening an external listing
- **WHEN** a person opens a job's original listing
- **THEN** Afavers does not silently mark the application as submitted

### Requirement: Compact default discovery view
At 390x844 CSS pixels the default Jobs view SHALL show the start of at least one available result within 420 CSS pixels from the page top, excluding optional expanded panels and system/browser chrome. Saved-search creation SHALL not occupy the default result viewport.

#### Scenario: Opening Jobs with results
- **WHEN** the default phone Jobs view loads with at least one matching result
- **THEN** a result starts within the defined height budget and search, filter access and sort remain available

### Requirement: Filter and saved-search parity
All current query, location, status, source, relative date, remote, student and strong-match criteria and sorting options SHALL remain available with unchanged predicates. Applied criteria SHALL be visible and individually removable. Saved searches SHALL preserve account/device scope, the 12-search limit and relative date semantics without implying email subscription.

#### Scenario: Reopening a saved seven-day search later
- **WHEN** a person selects a saved search with a seven-day date window on a later date
- **THEN** the current relative seven-day range is applied and no email alert is enabled by that selection

#### Scenario: Clearing one active criterion
- **WHEN** a person removes the remote criterion
- **THEN** only that criterion changes and all other active criteria remain applied

### Requirement: Responsive details and recoverable context
Wide layouts SHALL support result selection and readable details together when content width permits. Narrow layouts SHALL open a dedicated detail view. Returning SHALL restore search criteria, ordering, loaded range, scroll anchor and focus without exposing private drafts in URLs.

#### Scenario: Phone back from a selected vacancy
- **WHEN** a person opens a vacancy after scrolling a filtered list and returns
- **THEN** the same query, filters, ordering and list position are restored

#### Scenario: Direct selection references an unavailable vacancy
- **WHEN** a list selection or detail URL references a job the user cannot access or that no longer exists
- **THEN** an understandable unavailable state and return-to-results action appear without disclosing another account's data

### Requirement: Honest matches and timestamps
The UI SHALL preserve existing match calculation and display reasons/gaps on demand. Posted date, last observed in feed and personal modification time SHALL not be conflated.

#### Scenario: A person edits private notes
- **WHEN** notes are saved for a job
- **THEN** its last-observed feed timestamp and match score do not change merely because of that personal edit

### Requirement: Discovery data and tracking compatibility
The presentation refactor SHALL preserve account-scoped snapshots, latest-request-wins behavior, explicit refresh, deduplication including location, expired discovery filtering, meaningful tracked-job retention and hide/undo semantics.

#### Scenario: A different-city vacancy has the same title and company
- **WHEN** both vacancies are returned by the existing service
- **THEN** the result interface preserves them as separate opportunities

#### Scenario: An obsolete search request completes last
- **WHEN** an older request completes after the current request
- **THEN** the current query's results remain displayed

#### Scenario: Undoing a hide
- **WHEN** a person hides and then undoes hiding of an otherwise untracked vacancy
- **THEN** visibility is restored without creating permanent tracking content solely from the hide/undo action

### Requirement: Recoverable result states
Discovery SHALL support loading skeletons, first-run/no-results states, an actionable request failure, unavailable feed data and retry without losing the person's filters.

#### Scenario: Refresh fails
- **WHEN** an explicit refresh fails after usable results were shown
- **THEN** the interface reports the failure, retains usable prior content where safe and offers retry with the same criteria
