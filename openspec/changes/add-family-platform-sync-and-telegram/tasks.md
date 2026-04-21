## Execution Slice A: Foundations In The Current App

This slice is intended to be implementable without committing to the final external connector runtime or the final WeChat bridge runtime. It establishes the database model, internal matching logic, task creation, and notification payload foundations that the later slices build on.

## 1. Family Telegram Notifications

- [x] 1.1 Add Telegram recipient configuration for a single household parent receiver, keeping recipient identity in the database and the bot secret in runtime configuration
- [x] 1.2 Implement household daily-summary payload generation across multiple children
- [x] 1.3 Implement household weekly-summary payload generation across multiple children
- [x] 1.4 Implement factual event notifications for automatic completion, unresolved work, and sync failure
- [x] 1.5 Add idempotent delivery logging and duplicate suppression for Telegram messages
- [x] 1.6 Keep household Telegram delivery outside child/homework `message_routing_rules` for Release 1

## 2. Platform Account Binding And Sync

- [x] 2.1 Add platform account storage scoped by child, platform, and account identity, allowing multiple accounts for the same platform under one child
- [x] 2.2 Add scheduled sync orchestration with one active sync per child/platform and visible `attention_required` handling for invalid credentials or expired sessions
- [x] 2.3 Implement the IXL sync connector
- [x] 2.4 Implement the Khan Academy sync connector
- [x] 2.5 Add fixed daily batch scheduling for the initial sync cadence
- [x] 2.6 Stage Raz-Kids and Epic as follow-on connectors after the first rollout
- [x] 2.7 Add sync job health tracking, retry state, and failure summaries

## 3. Normalized Learning Events

- [x] 3.1 Add the normalized `learning_events` model and persistence layer
- [x] 3.2 Store platform account identity, platform source references, raw payload summaries, and child-scoped ownership
- [x] 3.3 Prevent duplicate event ingestion for repeated syncs using a stable per-platform deduplication key
- [x] 3.4 Normalize timestamps into the household time zone before homework matching runs

## 4. Aggressive Auto-Checkins

- [x] 4.1 Add rule evaluation for direct platform-task bindings
- [x] 4.2 Add rule evaluation for platform-plus-homework-type matches
- [x] 4.3 Add threshold-based rule evaluation for duration, attempts, or completion-state matches
- [x] 4.4 Persist `homework_auto_matches` with evidence details for every automatic update
- [x] 4.5 Surface unmatched imported activity for later review without blocking successful matches
- [x] 4.6 Enforce manual-state precedence so later automation cannot silently overwrite manual outcomes
- [x] 4.7 Prevent attachment-required homework from reaching `auto_completed` through duration evidence alone
- [x] 4.8 Handle multiple learning events matching the same homework without repeated completion side effects
- [x] 4.9 Implement earliest-match-wins as the primary evidence selection rule while preserving later matches as supporting evidence

## 5. Voice Homework WeChat Bridge Beta

- [x] 5.1 Create `voice_push_tasks` when recording-based homework is successfully submitted
- [x] 5.2 Package the final audio file for bridge delivery without requiring a caption
- [x] 5.3 Add retry, failure capture, and audit history for bridge delivery attempts
- [x] 5.4 Keep bridge delivery independent from the main homework completion path
- [x] 5.5 Preserve bridge idempotency so retries cannot deliver the same audio task multiple times
- [x] 5.6 Keep `message_routing_rules` focused on child/homework delivery targets such as WeChat bridge routing, without making household Telegram summary delivery depend on the same table

## 6. Verification And Rollout

- [x] 6.1 Add unit tests for sync deduplication, household time-zone normalization, Telegram payload building, and auto-match rules
- [x] 6.2 Add integration coverage for multi-child household summaries, same-day auto-checkins, and manual-state precedence
- [x] 6.3 Add smoke coverage for recording submission creating a voice push task without blocking homework completion
- [x] 6.4 Verify acceptance criteria for sync correctness, Telegram delivery behavior, bridge idempotency, and the revised channel-ownership model before rollout
- [x] 6.5 Pilot IXL and Khan Academy first before enabling later connectors

## Execution Slice B: Connector Delivery For The First Platforms

This slice should begin only after Slice A is complete and verified inside the current app. The goal is to connect the existing internal sync and learning-event model to real first-release platform inputs for IXL and Khan Academy.

- [x] B.1 Finalize the first-release connector runtime strategy for IXL and Khan Academy
- [x] B.2 Implement the IXL sync connector on top of the normalized event pipeline
- [x] B.3 Implement the Khan Academy sync connector on top of the normalized event pipeline
- [x] B.4 Add fixed daily batch execution for the after-school sync window and any additional release-one sync windows
- [x] B.5 Verify account-password plus managed-session handling for the supported connector flow
- [x] B.6 Verify duplicate prevention, unmatched-event handling, and earliest-match-wins behavior against real imported platform evidence

## Execution Slice C: Voice Bridge Runtime And Pilot Readiness

This slice should begin only after Slice A is complete and after the bridge deployment model is chosen for the pilot environment. The goal is to connect the internal `voice_push_tasks` workflow to a real bridge runtime without changing the main homework completion path.

- [x] C.1 Finalize whether the pilot bridge runtime is the home computer, Synology NAS, or a split coordinator/sender model
- [x] C.2 Implement the bridge worker that consumes `voice_push_tasks`
- [x] C.3 Add retry, failure capture, and idempotent audio delivery behavior in the chosen runtime model
- [x] C.4 Verify that bridge delivery failure never changes the successful homework submission result
- [x] C.5 Run pilot validation for bridge observability, retry handling, and duplicate-send prevention
