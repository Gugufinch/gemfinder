# GemFinder Shared Talent + Live CRM Plan

## Purpose
Evolve GemFinder from a set of separate project types into a shared talent system with:

- a pre-live sourcing and onboarding workspace
- a live CRM hub
- marketing flows layered on top of the live CRM

This plan is intentionally additive. The goal is to get to the new model without deleting or rewriting current A&R, curator, marketing, Gmail, or Slack workflows in one risky pass.

## Current truth

### What exists today
- `A&R` projects are used for sourcing new artists.
- `Curator` projects are used for sourcing and tracking curators.
- `Marketing` projects are currently acting as a live or legacy roster workspace.

### Important business reality
- The people in `Marketing` today are mostly the legacy / existing live roster.
- The people in `A&R` and `Curator` are mostly new talent we are trying to bring onto the platform.
- Contact information and social information should apply across all of them.

That means marketing is not just "another workflow." It is currently the closest thing GemFinder has to a live artist database.

## Product direction

### Target operating model
GemFinder should become:

1. `Scout + Onboarding`
   - pre-live workspace
   - includes artists and curators
   - supports sourcing, follow-up, advocacy, onboarding, and pre-live notes

2. `Live CRM`
   - master database for live talent
   - contains the full shared talent record
   - becomes the home for long-term roster relationship management

3. `Marketing`
   - campaign workflow layered on top of live talent
   - not a disconnected silo
   - marketing assignments attach to live talent records

## Core principle
Do not copy a person into a new system when they become live.

Instead:
- keep one shared talent record
- change its lifecycle state
- expose it in new views
- attach additional workflow records as needed

This is the safest way to preserve notes, history, associations, and context.

## Data model

### 1. Shared Talent Profile
This is the identity layer. One record per person.

Suggested fields:
- `talentId`
- `displayName`
- `talentKind`
  - `artist`
  - `curator`
  - `creator`
  - `ai_ugc`
- `platformLifecycle`
  - `pre_live`
  - `live`
  - `inactive`
  - `retired`
- `source`
  - `legacy_roster`
  - `ar_pipeline`
  - `curator_pipeline`
  - `songfinch`
  - `manual`
- `primaryEmail`
- `instagramHandle`
- `instagramUrl`
- `instagramFollowers`
- `tiktokHandle`
- `tiktokUrl`
- `tiktokFollowers`
- `spotifyUrl`
- `spotifyMonthlyListeners`
- `location`
- `aliases`
- `curatorPageUrl`
- `curatedArtists`
- `createdAt`
- `updatedAt`

### 2. Workflow assignment layer
This is the project-specific and campaign-specific layer.

Keep workflow records separate from identity.

#### Scout / A&R assignments
- `projectId`
- `talentId`
- `pipelineStage`
- `owner`
- `followUp`
- `notes`
- `replyIntel`
- `Gmail / inbox context`

#### Curator assignments
- `projectId`
- `talentId`
- `pipelineStage`
- `owner`
- `notes`
- `curatorPageUrl`
- `curatedArtists`

#### Marketing campaign assignments
- `projectId`
- `talentId`
- `campaignId` or `campaignName`
- `status`
- `title`
- `trafficType`
- `channels`
- `deliverableType`
- `owner`
- `briefUrl`
- `contentUrl`
- `dueDate`
- `notes`
- `rejectedReason`

## Lifecycle rules

### Shared lifecycle
Use a global lifecycle on the shared talent profile:
- `pre_live`
- `live`
- `inactive`
- `retired`

### Workspace-specific statuses

#### Scout / A&R
- `Prospect`
- `Contacted`
- `Engaged`
- `Won`
- `Onboarding`

#### Curator
- `Prospect`
- `Contacted`
- `Engaged`
- `Won`
- `Live`

#### Marketing
- `Prospect`
- `Contacted`
- `Interested`
- `Creating`
- `Reviewing`
- `Revising`
- `Complete`
- `Rejected`

These should stay separate from the shared lifecycle.

## View design

### Scout + Onboarding view
Purpose:
- work pre-live talent
- includes artists and curators
- shows outreach, onboarding, ownership, notes, and advocacy

Suggested top navigation:
- `Scout`
- `Live CRM`
- `Marketing`
- `Reports`

Suggested Scout filters:
- talent kind
- owner
- source
- lifecycle
- pipeline stage

### Live CRM view
Purpose:
- be the master "light" roster view
- show who is live on platform
- keep notes, metadata, campaign participation, and associations visible

Suggested columns/cards:
- name
- kind
- lifecycle
- source
- owner
- active campaigns
- key socials
- curator associations
- last touch / last note

### Marketing view
Purpose:
- campaign execution for live talent
- campaign assignments attached to shared talent records

Marketing should not be the master roster forever. It should become one of the operational layers on top of the live CRM.

## Transition logic

### When someone becomes live
When a pre-live person becomes platform-live:

1. update shared talent profile:
   - `platformLifecycle = live`

2. expose the same shared talent in `Live CRM`

3. preserve:
   - all notes
   - social/contact info
   - curator relationships
   - prior A&R/curator history

4. optionally auto-create a marketing assignment:
   - campaign: `Platform Announcement`
   - status: `Intro`
   - owner: configurable default

This gives the team a clear handoff into a connection/announcement workflow.

## Legacy roster strategy

### Recommended treatment
Treat the current marketing roster as the initial live CRM seed.

That means:
- existing marketing talent become `platformLifecycle = live`
- `source = legacy_roster`
- existing marketing campaign assignments remain intact

This avoids re-importing or rebuilding the live base from scratch.

## Shared talent profile behavior

### Shared fields
These should be shared across all workspaces:
- name
- contact info
- socials
- follower counts
- Spotify
- talent kind
- curator page

### Project-specific fields
These should remain separate per assignment:
- A&R stage
- curator stage
- marketing status
- owner
- due date
- notes
- brief/content links
- inbox/Gmail state

No project should silently override another project's workflow state.

## Multi-project rule
If Jen has an artist in one project and Greg has the same artist in another:

- both project assignments should exist
- neither one should override the other
- the shared talent profile should show both

The shared talent profile should be the "see everything" layer, not the "pick one winner" layer.

## Migration strategy

### Phase 1: shared talent backbone
Add a shared talent profile layer behind the scenes.

Link existing records by:
1. exact email
2. exact Spotify URL or ID
3. exact Instagram handle
4. exact TikTok handle
5. normalized display name
6. aliases

Important:
- do not delete current records
- do not rewrite Gmail thread ownership
- do not merge low-confidence matches automatically

### Phase 2: attach existing project records
Add `talentId` to:
- A&R artists
- curator records
- marketing assignments

### Phase 3: surface the new views
Add:
- `Scout`
- `Live CRM`
- `Marketing`

Keep current project flows functioning until the new views are trusted.

### Phase 4: automate the live transition
When a person becomes live:
- update lifecycle
- surface them in `Live CRM`
- optionally create intro marketing assignment

### Phase 5: gradually make Live CRM primary
Once stable:
- use `Live CRM` as the main roster hub
- treat project-specific screens as workspaces layered onto the shared database

## Safety rules

### Must not lose
- current A&R artist lists
- current curator records
- current marketing assignments
- Gmail/inbox history
- Slack behavior
- notes
- ownership
- follow-ups
- links

### Migration must be
- additive
- reversible
- confidence-aware
- workspace-safe

### Avoid
- destructive rewrites
- copying the same person into multiple disconnected systems
- overloading one status field for all workflows

## Recommended first implementation milestones

### Milestone 1
Shared talent layer exists and all current records can point to it.

### Milestone 2
New `Live CRM` view shows current live / legacy roster from shared talent data.

### Milestone 3
`Scout + Onboarding` view merges A&R and curator pre-live work.

### Milestone 4
`Become live` workflow promotes visibility into `Live CRM` and can create an intro marketing assignment.

### Milestone 5
Reporting spans:
- pre-live funnel
- live roster
- marketing campaigns

## Immediate next build recommendation

1. formalize shared talent identity fields
2. add `platformLifecycle` and `source`
3. seed current marketing roster as `live / legacy_roster`
4. create a basic `Live CRM` master view
5. keep all existing project workflows intact while this view is introduced

## Product note for review
This plan intentionally treats marketing not as a separate database, but as the current live roster layer that should eventually sit on top of a shared live CRM. That is the key move that makes the model coherent and protects existing work.
