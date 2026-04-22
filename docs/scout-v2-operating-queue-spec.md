# Scout V2 Operating Queue Spec

## Purpose
Turn Scout from a filtered discovery board into a working operating queue for pre-live talent.

This spec builds on the shared talent + live CRM direction in [gemfinder-shared-talent-live-crm-plan.md](./gemfinder-shared-talent-live-crm-plan.md). The goal is not to replace Kickoff. The goal is to make Scout the best place to discover, enrich, qualify, and hand off leads into Kickoff with less clicking and less repeated review work.

## Product statement
Scout should answer one question immediately:

"What should I review next, what decision do I need to make, and what is blocking this lead from moving forward?"

Today Scout is strongest at ranking and filtering. V2 should make it strongest at decision-making and handoff.

## Users

### Primary users
- Greg / A&R lead
- Team members qualifying artists
- Team members vetting curators

### Secondary users
- Operators assigning ownership
- Researchers filling data gaps
- Anyone reviewing what has already been seen or passed

## Jobs to be done

1. Find the highest-potential lead worth attention right now.
2. Decide quickly whether the lead should be enriched, qualified, passed, or handed off.
3. Fill missing signal without leaving the flow.
4. Avoid re-reviewing the same lead with no new information.
5. Move strong leads into Kickoff with context preserved.

## Core design principles

1. Scout is a queue, not a report.
2. The primary object is a decision, not a profile.
3. Every lead needs a clear next action.
4. Review context should stay visible while triaging.
5. Handoff to Kickoff should be explicit, fast, and traceable.
6. Artist and curator workflows should share infrastructure but not feel identical.

## Desired operating model

### Flow
1. Discover
2. Enrich
3. Qualify
4. Handoff

### End states
- Promoted to Kickoff
- Parked for later
- Passed
- Waiting on research

## Information architecture

### Top-level Scout tabs
- `Queue`
- `Review`
- `Saved Views`
- `Activity`

### Queue
Default entry point. Shows the next leads to work, not the full dataset.

### Review
Single-lead workspace with preview + decision controls.

### Saved Views
Reusable queue definitions for each user or team.

### Activity
Recent Scout decisions, changes, ownership updates, and handoffs.

## Primary screen: Queue

### Default landing state
Open into `Queue > My Work` or `Queue > Team Queue` depending on user role.

### Queue sections
- `Ready to Qualify`
- `Need Contact`
- `Need Reach`
- `Need Genre / Fit`
- `Curators to Vet`
- `Waiting on Research`
- `Recently Reviewed`

### Queue card structure
Each lead card or row should show:
- name
- talent kind
- queue label
- current recommendation
- why this lead is surfaced
- top signal metric
- contact readiness
- owner
- last reviewed
- decision status

### Primary actions on each lead
- `Open Review`
- `Promote to Kickoff`
- `Mark Need Info`
- `Pass`
- `Assign Owner`

### Secondary actions
- `Find Contact`
- `Verify Reach`
- `Tag Genre`
- `Add Note`
- `Set Follow-up`
- `Save to View`

### Sort modes
- Recommended
- Recently added
- Highest signal
- Needs response
- Oldest unreviewed
- Recently updated

## Secondary screen: Review

### Goal
Let the user make a decision without losing queue context.

### Layout
- Left: queue list
- Center: lead review surface
- Right: context rail

### Lead review surface
Should include:
- identity block
- top reason surfaced
- platform metrics
- contact status
- genre / location / source
- hit tracks or curator evidence
- profile summary
- previous Scout decisions
- decision buttons

### Context rail
Should include:
- last reviewed by
- last reviewed at
- current owner
- recent notes
- research tasks
- linked projects
- if already in Kickoff, show that status clearly

### Decision bar
Persistent action bar with:
- `Promote to Kickoff`
- `Need Info`
- `Pass`
- `Save Note`

## Tertiary screen: Saved Views

### Purpose
Let users return to the same operating slices without rebuilding filters.

### Example saved views
- High-signal artists
- Curators to vet
- Reach but no contact
- Contact ready this week
- Greg follow-up queue
- Team unreviewed leads

### Saved view fields
- view name
- owner
- filter config
- sort mode
- visible columns
- default action mode
- shared or private

## Tertiary screen: Activity

### Purpose
Track what changed so the team does not duplicate work.

### Events
- lead reviewed
- owner assigned
- research requested
- contact added
- reach updated
- passed
- parked
- promoted to Kickoff
- reopened

## Data model additions

### New Scout-specific fields on shared talent or workspace assignment
- `scoutDecision`
  - `unreviewed`
  - `needs_info`
  - `qualified`
  - `passed`
  - `parked`
  - `promoted`
- `scoutQueue`
  - `ready`
  - `contact_gap`
  - `reach_gap`
  - `fit_gap`
  - `curator_review`
  - `waiting_research`
  - `parked`
- `scoutOwner`
- `scoutPriorityScore`
- `scoutReason`
- `scoutNextAction`
- `scoutLastReviewedAt`
- `scoutLastReviewedBy`
- `scoutReviewCount`
- `scoutDecisionReason`
- `scoutDecisionNote`
- `scoutFollowUpDate`
- `scoutResearchStatus`
  - `none`
  - `requested`
  - `in_progress`
  - `done`
- `scoutResearchTasks`
- `scoutPromotionStatus`
  - `not_ready`
  - `ready`
  - `promoted`
- `kickoffAssignmentId`

### Derived fields
- `hasContact`
- `hasDirectEmail`
- `hasReach`
- `dominantPlatform`
- `dominantMetric`
- `fitConfidence`
- `freshnessScore`
- `handoffReadiness`

## Decision model

### Promote to Kickoff
Use when:
- lead has minimum contact path
- enough signal exists to start active outreach or onboarding
- owner is known or assignable

### Need Info
Use when:
- lead seems promising
- one or more blockers remain
- someone should explicitly own the next research step

### Pass
Use when:
- poor fit
- duplicated or stale lead
- signal does not justify more time

### Park
Use when:
- not a no forever
- just not now
- user wants it out of active review without losing it

## Handoff to Kickoff

### Principle
Promotion should be an explicit workflow event, not just a stage interpretation.

### Promote action requirements
When a user clicks `Promote to Kickoff`, the system should:
- confirm target project
- assign owner if missing
- preserve Scout notes and reasoning
- create or attach the kickoff workflow assignment
- stamp `promoted by`, `promoted at`, and `promotion note`
- show a success path to open the new Kickoff record

### Promotion payload
- target project
- owner
- initial kickoff stage
- handoff note
- carry over tags
- carry over key contact and signal fields

## Research task model

### Research task types
- find direct email
- verify manager / team
- confirm followers
- confirm monthly listeners
- identify genre / vibe
- review curator page
- review curated artists
- write short fit summary

### Task fields
- task type
- lead id
- status
- owner
- created at
- completed at
- resolution note

## Artist vs curator differences

### Shared pieces
- queue logic
- owner
- review history
- decision actions
- notes
- saved views

### Artist-specific review fields
- social reach
- listeners
- hit track
- contact path
- genre fit
- audience signal

### Curator-specific review fields
- curator page
- roster quality
- overlap with Songfinch targets
- advocacy value
- response path

### UX implication
Use the same shell, but swap the central review module and queue language depending on `talent kind`.

## Recommended default queues

### Team queues
- Unreviewed
- Ready to Qualify
- Need Contact
- Need Reach
- Curators to Vet
- Recently Promoted

### Personal queues
- My Leads
- My Research Tasks
- My Follow-ups
- My Recently Reviewed

## Metrics

### Outcome metrics
- leads promoted to Kickoff per week
- time from first Scout appearance to decision
- time from decision to Kickoff handoff
- percent of promoted leads with preserved context

### Efficiency metrics
- average clicks to decision
- average time spent per reviewed lead
- repeat reviews without new info
- percent of leads with explicit owner
- percent of leads with explicit next action

### Data quality metrics
- percent with direct contact
- percent with reach verified
- percent with genre / fit tagged
- percent with review history

## Empty, loading, and edge states

### Empty queue
Show:
- why it is empty
- which filters are active
- one clear reset action

### Loading
Use lightweight skeletons for queue and preview.

### Already promoted
If a lead is already in Kickoff:
- keep it visible only in history or linked state
- clearly show linked kickoff record
- avoid offering a second promotion CTA

### Duplicate detection
If a likely duplicate exists:
- show the existing record
- offer merge or open existing
- block accidental duplicate promotion

## Permissions

### Viewer
- can browse queues
- can open review
- cannot change decisions or promote

### Editor
- can review
- can assign
- can request research
- can promote

### Admin
- can do all editor actions
- can change queue rules and shared saved views

## Suggested implementation phases

### Phase 1: Operating queue foundation
- add Scout decision fields
- add owner + review memory
- add queue sections
- add explicit lead actions
- add promote-to-Kickoff flow

### Phase 2: Review workspace
- add split queue + preview layout
- add persistent decision bar
- add research tasks
- add activity history

### Phase 3: Team coordination
- add saved views
- add shared queues
- add bulk triage
- add duplicate handling

### Phase 4: Intelligence layer
- improve ranking
- add confidence explanations
- add recommended next action tuning
- add queue health metrics

## Acceptance criteria

### Queue
- user can make a Scout decision without opening a full profile page
- every visible lead has a clear next action
- queue remembers who reviewed a lead and what happened

### Review
- user can move through leads sequentially without losing place
- user can promote to Kickoff with one focused handoff flow
- user can request missing research from the same screen

### Team workflow
- team can see what has already been reviewed
- team can see what is blocked and who owns it
- team can reopen parked or passed leads intentionally

## Recommended first implementation slice

Build this first:
- explicit Scout decisions
- owner + review metadata
- `Promote to Kickoff` action
- right-side preview panel
- `Need Info` research tasks

That is the smallest slice that changes Scout from "smart list" to "actual operating workflow."

## Open questions
- Should `Pass` and `Park` be separate states in reporting, or only separate in activity history?
- Should promotion always require an owner, or auto-assign to the current actor when blank?
- Should research tasks live inside Scout only, or be shared with a broader workspace task system later?
- Should curator promotion land in the same Kickoff surface or a curator-specific handoff view?
