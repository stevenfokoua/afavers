## ADDED Requirements

### Requirement: Prioritized agenda
The dashboard SHALL present due follow-ups, upcoming interviews and resumable applications before optional informational content. Every agenda item SHALL identify its job/context, relevant date and useful destination/action.

#### Scenario: A follow-up is due and an interview is upcoming
- **WHEN** both conditions exist
- **THEN** both are discoverable in the primary agenda before optional news or discovery widgets

### Requirement: Coherent summary counts
Dashboard counts SHALL derive from the existing authoritative definitions and avoid conflicting or redundant prominent totals. Manual jobs SHALL remain excluded from feed-new counts according to existing behavior.

#### Scenario: A manual application is created today
- **WHEN** the dashboard refreshes
- **THEN** the manual record can contribute to its appropriate application stage but does not inflate the feed-new-today count

### Requirement: Retained configurable information
All current widget capabilities and saved visibility preferences SHALL survive reorganization, including news, stories, new jobs, follow-ups, interviews, applications, quick actions, goals, calendar, pipeline and weekly activity. Existing map, goal and gamification functionality SHALL remain reachable.

#### Scenario: An existing user has hidden News
- **WHEN** the redesigned dashboard first loads for that user
- **THEN** the saved hidden preference is honored and the widget can still be enabled through dashboard editing

### Requirement: Honest quiet dashboard
When there are no due tasks the dashboard SHALL show a calm, truthful empty agenda and useful navigation without fabricating urgency, progress or success.

#### Scenario: A new account has no applications
- **WHEN** the account opens the dashboard
- **THEN** it receives a clear path to finding jobs or configuring preferences and no fictional applications appear
