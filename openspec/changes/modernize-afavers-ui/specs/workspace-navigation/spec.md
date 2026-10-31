## ADDED Requirements

### Requirement: Complete task-grouped navigation
The shell SHALL expose every existing authorized destination through task-grouped navigation. Settings and account controls SHALL remain accessible. Administrator navigation SHALL remain limited to authorized administrators.

#### Scenario: A regular user opens navigation
- **WHEN** a non-administrator opens desktop navigation or phone More
- **THEN** all regular destinations are reachable and no administrator operation becomes accessible

### Requirement: Device-appropriate shell
The shell SHALL provide expanded desktop navigation, a collapsible intermediate layout and a phone header/bottom navigation with Home, Jobs, Applications, Reminders and More. Safe-area padding SHALL prevent content and actions from being obscured.

#### Scenario: A person uses a narrow phone
- **WHEN** the viewport is 320 CSS pixels wide
- **THEN** essential navigation fits without page overflow and all secondary destinations remain reachable through More

### Requirement: Route and history compatibility
All existing public, protected, administrator and job-detail paths SHALL retain their intended behavior. Navigation SHALL preserve authentication and onboarding guards and usable browser history.

#### Scenario: Existing job bookmark
- **WHEN** an authenticated, onboarded person opens an existing `/jobs/:id` link
- **THEN** the authorized job detail is shown without requiring the new list-inspector URL form

#### Scenario: Protected route while signed out
- **WHEN** a signed-out person opens a protected route
- **THEN** existing authentication protection remains effective before private data is rendered

### Requirement: Keyboard orientation
The shell SHALL preserve a skip link, logical focus order, accessible current-destination state and focus restoration after dismissing transient navigation.

#### Scenario: Closing phone navigation with a keyboard
- **WHEN** a keyboard user closes More or a navigation drawer
- **THEN** focus returns to its trigger and the underlying page remains usable
