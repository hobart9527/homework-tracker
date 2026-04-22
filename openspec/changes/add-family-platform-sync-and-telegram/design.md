## Context

This change builds on the existing `homework-tracker` product, which already manages assignments, child check-ins, parent dashboard views, and recording attachments. The next phase expands the system from an internal tracker into a household operations layer that watches external learning platforms, converts outside activity into homework progress, and pushes summary updates to one parent through Telegram.

The target operating model is intentionally narrow:

- one family
- multiple children
- multiple platform accounts per child
- one Telegram recipient for the family

This scope keeps the design focused while still covering the real-world complexity of international-school homework workflows.

## Goals / Non-Goals

**Goals**

- Normalize learning activity from IXL, Raz-Kids, Epic, and Khan Academy into one internal event model.
- Support account binding and scheduled synchronization for multiple platforms per child.
- Automatically complete homework aggressively when imported same-day learning evidence clearly maps to assigned work.
- Preserve the exact imported learning content behind every automatic completion.
- Deliver household daily and weekly Telegram summaries plus basic factual event notifications.
- Queue recording-based homework for delivery to a personal WeChat-group bridge without blocking the main homework submission path.

**Non-Goals**

- AI-generated coaching suggestions or tutoring advice in this phase.
- Multiple parent recipients or per-recipient channel preferences.
- A universal connector framework for every education platform.
- Making WeChat bridge delivery part of the core homework success path.
- Automating non-audio homework into personal WeChat groups.

## Decisions

### Decision: Use a normalized learning-event layer between external sync and homework automation

All platform-specific imports will be translated into a shared `LearningEvent` model before any homework matching runs. This model records child identity, platform, event timestamp, learning title, subject, duration, score or progress, completion state, source reference, and raw payload summary.

Rationale:

- Keeps homework logic stable across platforms with different data shapes.
- Preserves explainability for auto-completed homework.
- Allows Telegram notifications to read a single source of truth rather than connector-specific data.

Alternatives considered:

- Matching directly inside each connector: simpler short term, but duplicates business logic and weakens auditability.
- Storing only raw payloads: flexible, but pushes translation complexity into downstream services.

### Decision: Scheduled sync is the default path, with manual sync as a supporting operator action

After a parent binds a platform account, the system will run scheduled synchronization automatically. Manual sync remains available as a fallback and troubleshooting tool, but not as the expected daily workflow.

Rationale:

- Matches the user’s requested product behavior.
- Reduces parent operational burden.
- Still gives operators a recovery tool when credentials or sync timing fail.

Alternatives considered:

- Manual sync first, scheduled sync later: safer for rollout, but does not meet the current product goal.
- Real-time sync only: infeasible across heterogeneous platforms and likely too brittle.

The first release uses a fixed batch schedule several times per day rather than near-real-time polling.
The primary initial sync window should start after school, using a batch that runs after 15:30 local time.

### Decision: Use a managed-session-first connector runtime inside the current app for the first IXL and Khan Academy rollout

The first-release connector runtime should stay inside the existing app boundary rather than introducing a separate worker service. Scheduled sync enters through the shared platform-sync route, manual troubleshooting enters through the import route, and both paths call the same managed-session execution layer for IXL and Khan Academy.

Rationale:

- Keeps the first release operationally simple while the supported platform set is intentionally narrow.
- Reuses the same normalized event pipeline, sync-job model, retry handling, and audit trail for both scheduled and manual runs.
- Avoids prematurely committing to a separate connector daemon before the household workflow and platform failure modes are better understood.

Alternatives considered:

- Separate connector worker from day one: cleaner long term, but adds deployment and observability overhead before the first-release runtime model is proven.
- Pure raw-payload/manual import only: useful for debugging, but does not satisfy the intended scheduled household workflow.

The concrete first-release runtime strategy is:

- scheduled execution calls the shared sync orchestrator and defaults to IXL plus Khan Academy only
- manual execution remains available for operator recovery and acceptance checks
- IXL and Khan Academy use stored managed-session cookies as the fetch credential at runtime
- account identity may still be captured during binding, but the live connector fetch path depends on managed-session material rather than replaying a password login flow inside the app
- expired or invalid managed sessions must move the account into `attention_required` instead of silently returning no events
- retryable connector failures must remain visible as `failed` jobs with retry metadata
- raw event import remains available as a debugging and support path, not the primary release workflow

### Decision: Use aggressive auto-checkins with mandatory evidence storage

If same-day platform learning evidence exists and matches a configured rule, the system will auto-complete eligible homework without waiting for parent review. Every such completion must store the evidence basis that triggered it.

Rationale:

- Reflects the requested high-automation experience.
- Keeps parents out of daily review loops.
- Avoids “silent magic” by preserving a visible evidence trail.

Alternatives considered:

- Conservative confirmation-based auto-checkins: lower risk, but slower and more manual than requested.
- Fully implicit completion without evidence storage: easier to implement, but poor for trust and debugging.

The first threshold rule is explicit: if imported learning duration is greater than or equal to the homework-required duration, the assignment should be marked `auto_completed`.
When multiple learning events match the same homework item, the system should use earliest-match-wins as the primary evidence rule.

### Decision: Limit Telegram notifications to factual progress updates in this phase

Telegram notifications will include only completion facts, unresolved work, imported learning highlights, and sync failures. Coaching tips and AI-generated guidance are deferred.

Rationale:

- Keeps the first release easier to verify.
- Reduces copy complexity and product ambiguity.
- Aligns with the user’s explicit de-scoping of tutoring advice.

Alternatives considered:

- Rules-based suggestions: useful, but not essential to proving this phase.
- AI-authored summaries: attractive later, but too many moving parts for the current scope.

The delivery pattern is mixed:

- immediate event notification when homework is completed
- one daily household summary sent during the 21:30-22:00 window

Telegram should be treated as a household-level parent channel in the first release rather than as a per-homework routing target. Homework-level or child-level routing rules may later support Telegram as an explicit override, but Release 1 should keep family Telegram delivery separate from homework message-routing concerns so that household summaries, parent completion notifications, and WeChat bridge routing do not share one ambiguous target model.

### Decision: Store Telegram recipient identity in the database, but keep the bot secret in runtime configuration

The first release should persist the household Telegram recipient reference in application data, but the Telegram bot secret should stay in runtime configuration rather than in a normal parent profile row.

Rationale:

- `telegram_chat_id` and an optional recipient label are household-owned business configuration and need to be editable per family.
- The bot token is a channel secret, not household content, and should be treated like other runtime credentials.
- This keeps the product compatible with the current one-household, one-recipient pilot while avoiding normalizing secret storage into application-level profile tables.

Alternatives considered:

- Store the bot token directly on the parent row: simple short term, but weakens secret handling and blurs the line between household settings and runtime credentials.
- Put both chat identity and token in environment variables: operationally simple, but makes per-household setup impossible.

The first release should therefore use:

- database-backed `telegram_chat_id`
- database-backed `telegram_recipient_label`
- runtime-configured `TELEGRAM_BOT_TOKEN`

### Decision: Keep message routing focused on delivery targets for child- and homework-level outputs, not household summary channels

`message_routing_rules` should resolve where child- or homework-scoped outbound items go, especially for WeChat bridge delivery. It should not be treated as the source of truth for the household Telegram summary channel in the first release.

Rationale:

- Homework routing and household summary delivery belong to different object owners.
- The WeChat bridge needs a stable target abstraction for child defaults and homework overrides.
- Household Telegram notifications already have a single family-owned recipient and do not benefit from being forced through the same routing table.

Alternatives considered:

- Unify all outbound channels under one routing table immediately: looks generic, but collapses family-level and homework-level ownership into one model too early.
- Separate everything permanently: clearer, but may be too rigid if a later phase adds true per-homework Telegram overrides.

### Decision: Treat personal WeChat-group audio delivery as an isolated Beta bridge

Audio homework submission will generate a `voice_push_task`, but the homework completion itself will succeed independently of whether the WeChat bridge later delivers the recording to a personal group. The bridge is modeled as an external worker or automation layer rather than a core Next.js request path.

Rationale:

- Keeps a high-risk unofficial delivery path from destabilizing the main product.
- Matches the project’s need to support teacher visibility without redefining homework success around a messaging channel.
- Makes it possible to evolve the bridge implementation later without rewriting core homework logic.

Alternatives considered:

- Inline delivery during check-in submission: simpler demo path, but fragile and blocks the user-facing workflow.
- Manual export only: safe, but does not meet the stated automation goal.

The first delivery payload contains only the final audio file and no additional caption requirement.

### Decision: Use a split coordinator/sender bridge runtime for the pilot

The pilot bridge runtime should use a split model. The current app remains the queue coordinator and retry authority for `voice_push_tasks`, while the actual audio delivery happens in an external bridge sender reached through a webhook-style HTTP call.

Rationale:

- Keeps unofficial or desktop-dependent WeChat delivery logic outside the main app runtime.
- Lets the app own queue state, retries, idempotency, and audit history without needing to host GUI automation itself.
- Works with either a home computer sender or a Synology-hosted bridge endpoint, as long as one reachable sender endpoint exists.

Alternatives considered:

- Home computer only with local queue state: simpler on one machine, but weakens observability and makes retries depend on one host.
- Synology-only sender with all queue logic moved out of the app: cleaner for operations, but pushes too much first-release logic into a second runtime at once.

The concrete pilot bridge strategy is:

- the app exposes a worker entrypoint that consumes pending and retrying `voice_push_tasks`
- the worker builds a stable per-task delivery key and forwards the audio delivery request to the external bridge endpoint
- the bridge endpoint returns `sent`, `duplicate`, or failure semantics back to the app worker
- duplicate acknowledgements are treated as successful sends so retries remain idempotent
- the app remains the source of truth for retry budget, failure history, and terminal task state

### Decision: Present WeChat delivery as an app-integrated capability while preserving multiple destination groups

The first release should treat WeChat delivery as a built-in capability of the current product rather than as a separately managed “bridge product” in the user experience. The implementation may still use an internal sender runtime, but the product model must preserve multiple destination groups and hide raw delivery identifiers from normal household configuration.

Rationale:

- Matches the user expectation that WeChat delivery should feel integrated into the app rather than like a second system to deploy and reason about.
- Preserves the real-world workflow where different assignments may need to go to different teacher groups.
- Lets the current queue, retry, and idempotency machinery remain in place without keeping a technical bridge mental model in the main UI.

Alternatives considered:

- One global default WeChat group: simpler, but wrong for the multi-teacher, multi-homework workflow.
- Exposing raw routing-rule editing as the main UX: flexible, but too technical for the household setup flow.
- Removing the sender runtime abstraction entirely: appealing on paper, but not realistic for QR login, group discovery, and proactive media delivery.

The first-release product model should therefore be:

- household-owned WeChat sender status
- household-owned list of discovered or saved WeChat groups
- optional child-level default WeChat group
- optional homework-level WeChat group override
- no requirement for users to understand bridge URLs or raw `recipient_ref` values in the main flow

## Architecture

### 1. Platform Account Layer

Each child can own multiple platform-account bindings. A platform account stores the external account reference, auth mode, status, sync health, and last successful sync metadata.

Responsibilities:

- child-level account mapping
- credential or session reference storage
- health and last-sync visibility

The first release may use account-password credentials together with managed session storage, but credential storage must remain isolated from ordinary learning records.
The first release must also support multiple accounts for the same platform under a single child, for example a family account and a school account, while preserving account-level auditability.

### 1B. WeChat Group Directory Layer

The first release should introduce a household-owned WeChat group directory. This directory stores discovered or manually registered target groups while preserving the runtime-facing `recipient_ref` internally.

Responsibilities:

- keep the set of selectable WeChat teacher groups for the household
- store a human-friendly display name or alias
- preserve the underlying sender `recipient_ref`
- track whether a group has been recently seen by the sender runtime

This layer should become the user-facing object for WeChat target selection instead of raw message-routing rows.

### 2. Sync Orchestrator

The orchestrator schedules and runs connector jobs. Each connector handles one platform, but all jobs report into a shared sync-job model.

Responsibilities:

- periodic scheduling
- deduplicated active sync protection per child/platform
- retry and failure reporting
- normalized event handoff

The initial rollout order is:

1. IXL
2. Khan Academy
3. Raz-Kids
4. Epic

For the first release, the orchestrator runtime stays in-process with the current app:

- scheduled sync enters through the platform-sync run route on a fixed daily batch cadence
- manual troubleshooting enters through the platform-sync import route
- both paths call the same managed-session connector execution layer
- both paths hand normalized events into the shared learning-event and auto-checkin pipeline

This keeps connector behavior consistent across scheduled execution, manual retry, and acceptance testing.

### 3. Learning Event Store

Imported records are persisted as normalized learning events. Homework automation, Telegram summaries, and future analytics all read from this layer.

Responsibilities:

- event persistence
- platform source reference storage
- raw summary retention for audits

### 4. Auto-Checkin Engine

The engine scans current assignments against same-day learning events and applies configured rules.

Rule categories:

- direct platform-task bindings
- platform + homework-type mappings
- threshold rules based on duration, count, or completion state

Result states:

- `auto_completed`
- `partially_completed`
- `unmatched`

### 5. Telegram Notification Layer

A household-level Telegram notification service consumes homework and sync outcomes and produces:

- daily summary
- weekly summary
- event notifications for sync failures, automatic completions, and unresolved work

The first release must support immediate “homework completed” events plus one nightly household digest in the 21:30-22:00 window.
Its recipient identity is resolved from the household parent record, not from `message_routing_rules`.

### 6. Voice Push Bridge Queue

Completed audio homework creates a bridge task that packages child name, assignment title, submission time, and the final audio file for downstream delivery to a personal WeChat group bridge.

The first release should only require the final audio file to be delivered. Captions remain optional and out of scope.
The intended pilot runtime for the bridge is a home always-on computer or a Synology NAS environment.

For the pilot, the queue runtime is split across two responsibilities:

- the app owns task selection, retry accounting, and state transitions
- the external bridge sender owns the final WeChat-group delivery attempt

This allows the sender implementation to vary by environment without changing the queue semantics in the core app.

The product-facing ownership model for Release 1 should be:

- household owns sender status and the available WeChat group directory
- child may own an optional default WeChat group
- homework may own an optional WeChat group override and the “send this homework to WeChat” decision

Delivery target precedence is:

1. homework-specific WeChat group
2. child default WeChat group
3. no WeChat delivery

This preserves multi-group flexibility without forcing parents to manage raw routing records directly.

## Data Model

### `platform_accounts`

- `id`
- `child_id`
- `platform`
- `external_account_ref`
- `auth_mode`
- `status`
- `last_synced_at`
- `created_at`

### `platform_sync_jobs`

- `id`
- `platform_account_id`
- `trigger_mode`
- `status`
- `started_at`
- `finished_at`
- `error_summary`
- `raw_summary`

### `learning_events`

- `id`
- `child_id`
- `platform`
- `platform_account_id`
- `occurred_at`
- `event_type`
- `title`
- `subject`
- `duration_minutes`
- `score`
- `completion_state`
- `source_ref`
- `raw_payload`

### `homework_auto_matches`

- `id`
- `homework_id`
- `learning_event_id`
- `match_rule`
- `match_result`
- `created_at`

### `notification_deliveries`

- `id`
- `channel`
- `recipient_ref`
- `template`
- `payload_summary`
- `status`
- `sent_at`
- `failure_reason`

### `voice_push_tasks`

- `id`
- `child_id`
- `homework_id`
- `check_in_id`
- `attachment_id`
- `target_group_ref`
- `status`
- `attempt_count`
- `last_attempted_at`
- `failure_reason`

## User Flows

### Parent setup flow

1. Parent opens child settings
2. Parent binds one or more platform accounts for that child
3. Parent links one Telegram recipient for the family
4. System schedules automatic sync

### Automatic sync and check-in flow

1. Scheduler triggers platform sync
2. Connector imports activity records
3. Records are normalized into `learning_events`
4. Auto-checkin engine evaluates same-day assignments
5. Matched homework is auto-completed or partially completed
6. Evidence appears on the assignment history
7. Telegram event or digest includes the result

### Audio homework delivery flow

1. Child submits recording-based homework
2. Core homework submission completes and stores the recording
3. System creates a `voice_push_task`
4. Bridge worker attempts delivery to the configured personal WeChat group
5. Delivery outcome is stored separately from homework completion

## Error Handling

### Platform sync failure

- preserve sync-job error summary
- do not block other platform jobs
- notify parent only at the configured factual level

### Auto-checkin no match

- retain normalized learning event
- mark the match result as `unmatched`
- allow future UI surfaces to show “synced but not counted”

### Telegram delivery failure

- retry with idempotency protection
- log delivery attempts
- do not re-run homework automation

### Voice bridge failure

- do not roll back the homework submission
- store failure metadata in `voice_push_tasks`
- allow retry without resubmitting the assignment

## Edge Cases

### Learning Event Deduplication

The system must treat repeated imports of the same external learning record as one logical event. If the same child, platform, and source reference are synchronized multiple times, only one canonical `learning_event` may be persisted. Duplicate imports must not trigger repeated auto-checkins, duplicate point awards, or duplicate Telegram event notifications.

### Multiple Matches Against The Same Homework

More than one same-day learning event may match the same homework item. In that case, only one primary match may drive a homework status transition. Additional matching events should be preserved as supporting evidence, but they must not repeatedly complete the same homework item or trigger repeated side effects.

The first release uses earliest-match-wins as the primary evidence rule. The first `learning_event` that satisfies the configured match rule becomes the primary evidence record. Later matching events remain attached as supporting evidence only.

### Manual State Precedence

Manual homework actions remain authoritative. If a homework item has already been completed manually, later imported learning evidence may enrich the audit trail, but it must not overwrite the existing completion state or create a second completion event. If a homework item has been manually skipped, excused, or otherwise resolved outside automation, the auto-checkin engine must not silently reverse that outcome.

### Partial Evidence Versus Full Completion

Imported learning evidence is not always sufficient to satisfy the full assignment. When homework requires additional proof such as audio, photo, or another attachment, study duration alone must not automatically satisfy the entire assignment. In those cases, the system should preserve the imported evidence and mark the homework as `partially_completed` rather than `auto_completed`.

### Cross-Day Attribution

All imported learning events must be attributed using the household’s configured local time zone. Events near midnight must be normalized before matching so that late-night activity is attached to the correct homework day.

### Backfill Behavior

If a sync fails during the day and later succeeds, the system may backfill same-day learning events and still apply auto-checkins to the correct assignment date. Backfilled events must update the audit trail without creating duplicate completion effects.

### Invalid Duration Values

Imported duration values must be validated before they are used in threshold rules. Missing, zero, negative, or clearly abnormal durations must not directly trigger `auto_completed`. Such events may still be stored for audit purposes, but they must not be treated as valid completion evidence until normalized or reviewed.

### Multiple Accounts Per Child Per Platform

The first release must allow more than one account for the same platform under a single child, such as a family account and a school account. Sync, audit, deduplication, and matching logic must therefore preserve account identity instead of assuming platform uniqueness at the child level.

### Voice Push Idempotency

A single `voice_push_task` may be retried when the bridge path is unstable, but retries must not cause the same audio file to be sent repeatedly to the target group. The voice bridge flow must preserve idempotency even when acknowledgements are delayed or missing.

## Compatibility Risks

### Platform Data Shape Differences

IXL and Khan Academy should not be treated as identical data sources. One platform may expose richer duration or skill-level evidence, while another may emphasize lesson or activity completion. The shared threshold rule of “imported duration greater than or equal to required duration” is a useful baseline, but platform-specific matching rules will still be required.

### Credential And Session Lifecycle

The first release allows account-password credentials together with managed session storage, which introduces operational risk: password changes, expired sessions, MFA prompts, captcha challenges, and unusual-login protections. The system therefore needs an intermediate operational state such as `attention_required`; it is not sufficient to model sync outcomes as only `success` or `failed`.

The chosen first-release runtime strategy intentionally limits the live fetch path to managed-session execution for IXL and Khan Academy. This reduces the amount of login automation inside the app, but it also means session freshness becomes the key operational dependency and must be checked explicitly before connector fetch attempts.

### Telegram Delivery Variance

Telegram delivery must tolerate recipient-side and platform-side variance, including invalid chat IDs, rate limits, muted chats, blocked bots, or revoked access. Immediate event notifications and nightly digests should be treated as separate delivery attempts with separate retry and failure states.

### Runtime Differences Between Home Computer And Synology NAS

The WeChat bridge runtime is not environment-neutral. A home always-on computer is a more natural host for desktop-driven automation or GUI-dependent sending flows, while a Synology NAS is more naturally suited to queue coordination or webhook hosting. The split coordinator/sender model reduces this risk by keeping queue truth in the app while allowing the final sender host to vary.

### Duplicate Information Across Telegram Channels

The same homework completion may appear in both an immediate Telegram notification and the nightly household digest. This overlap is acceptable only if treated as intentional product behavior rather than a duplication bug. The implementation plan should explicitly decide whether the nightly digest includes all same-day completions or suppresses items that already triggered immediate alerts.

### Source Platform Instability

Because the design does not assume stable public APIs for all target platforms, sync behavior may vary with page structure changes, export format differences, or anti-automation controls. Connector failures must degrade gracefully without corrupting homework state or blocking unrelated platform syncs.

## Release 1 Bar

Release 1 is defined by operational completeness, not just feature presence. A workflow is not release-ready unless its user-facing behavior, correctness guardrails, and verification criteria are all included in the same release.

For this change, Release 1 must include:

- scheduled sync for the initial supported platforms, IXL and Khan Academy
- aggressive auto-checkins based on same-day imported evidence
- immediate Telegram completion notifications and one nightly household digest
- audio homework bridge-task creation and delivery handling
- deduplication for imported learning events
- protection against repeated auto-completion from duplicate sync data
- precedence rules that preserve manual homework actions
- partial-completion handling when imported evidence does not satisfy the full assignment
- visible failure states for invalid credentials or expired sessions
- retry and duplicate-suppression behavior for Telegram delivery
- retry and idempotency behavior for audio bridge delivery
- audit visibility for why homework was auto-completed, partially completed, or left unmatched
- acceptance checks that can be executed before rollout

Release 1 is not acceptable if duplicate platform records can create repeated learning events, repeated auto-checkins, repeated points, or repeated notifications. It is also not acceptable if manual homework outcomes can be silently overwritten, if attachment-required homework can be fully completed from duration evidence alone, or if connector failures appear as silent “no data” states.

The supported scope may remain intentionally narrow in this release: one household, multiple children, one Telegram recipient, IXL and Khan Academy as the initial platforms, and a Beta WeChat bridge for audio homework only. Within that scope, the release bar is correctness first, then expansion.

## Acceptance Criteria

### Platform Sync

The system must allow a single household to bind IXL and Khan Academy accounts across multiple children independently, including multiple accounts for the same platform under one child. At scheduled batch times, the system must create and execute sync jobs for eligible child-platform-account bindings. The system must prevent concurrent duplicate sync jobs for the same child, platform, and account within the same execution window. Re-importing the same platform record from the same account source must not create duplicate `learning_events`. When credentials or sessions are invalid, the platform account must transition into an operationally visible failure or attention state rather than appearing to sync successfully with zero data.

### Auto-Checkins

When imported learning evidence includes a valid study duration greater than or equal to the homework-required duration, and no additional proof requirement blocks completion, the homework must transition to `auto_completed`. When imported evidence supports progress but does not satisfy the full requirement, the homework must transition to `partially_completed`. Repeated imports of the same evidence must not create duplicate completions, duplicate points, or duplicate status changes. When multiple learning events match the same homework, the earliest matching event must become the primary evidence and later matches must not change status again. Parents must be able to inspect the basis of any auto-completed homework, including platform, platform account source, learning title, duration or completion value, and sync time. Manual completions must remain stable and must not be overwritten by later automation.

### Telegram Notifications

The system must send an immediate Telegram notification when homework is completed automatically. The system must also send one nightly household digest during the 21:30-22:00 window. Delivery failure for either message type must not affect homework completion state. Retries must not cause duplicate immediate notifications for the same logical homework-completion event. The nightly digest must correctly aggregate multiple children within one household.
The first release must read the Telegram recipient identity from household-owned database fields and must read the Telegram bot secret from runtime configuration rather than a normal parent profile field.

### Voice Homework Bridge

When a recording-based homework submission succeeds, the system must create a `voice_push_task` referencing the final audio artifact. Failure of the bridge delivery path must not change the successful homework submission result. Retrying a failed voice push must not cause duplicate audio deliveries for the same task. The task state must remain queryable through at least `pending`, `retrying`, `sent`, and `failed`.

### Operational Observability

Operators or maintainers must be able to inspect recent platform sync status, sync failures, duplicate-prevention behavior, and pending or failed voice push tasks. The system must retain enough audit detail to explain why a homework item was auto-completed, partially completed, or left unmatched.

## Security And Audit

- Keep platform account bindings scoped per child
- Keep all auto-completion actions auditable through the learning event and match records
- Do not expose bridge failures to the child submission success path
- Minimize raw payload storage to what is needed for support and audit

## Remaining Clarifications

The main product behavior is now clear. Remaining work is implementation planning rather than product clarification. The only details still best finalized inside the implementation plan are:

- platform-specific matching details for IXL and Khan Academy beyond the shared duration threshold
- the concrete sender implementation details for the chosen bridge host
