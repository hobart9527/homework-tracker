## Why

The current homework tracker already supports assignment management, parent dashboards, and child check-ins, but families still need to manually inspect external learning platforms and manually decide whether outside learning should count toward homework completion. Parents also do not yet receive a unified daily or weekly summary through Telegram, and teachers cannot reliably see recording-based homework from a personal WeChat group workflow.

This change is needed to turn the project into an active family workflow assistant for a single household with multiple children. The system should ingest external learning records on a schedule, automatically complete eligible homework, preserve the exact learning evidence used for those completions, and notify the parent through Telegram without requiring daily manual review.

## What Changes

- Add multi-child, multi-platform account binding for a single household with one Telegram parent recipient.
- Add scheduled learning-record synchronization with an initial first-release focus on IXL and Khan Academy, while preserving a staged path for Raz-Kids and Epic.
- Add a normalized learning event model that captures the exact activity content imported from each external platform.
- Add aggressive automatic homework completion rules that auto-check eligible work as soon as same-day learning evidence is imported.
- Add Telegram daily summaries, weekly summaries, and basic event notifications focused on factual completion status rather than coaching advice.
- Add a Beta outbound queue for recording-based homework so submitted audio can be pushed toward a personal WeChat group delivery bridge for teacher visibility.

## Capabilities

### New Capabilities

- `family-telegram-notifications`: Deliver household-level Telegram updates to one parent recipient covering multiple children.
- `multi-platform-learning-sync`: Bind multiple platform accounts per child, including multiple accounts for the same platform when needed, and run scheduled imports for supported external learning tools, with IXL and Khan Academy as the initial rollout platforms.
- `normalized-learning-events`: Persist imported learning records in a shared model with title, subject, duration, completion state, and source references.
- `aggressive-auto-checkins`: Match same-day learning evidence to homework and automatically complete or partially complete eligible assignments while preserving the matching basis.
- `voice-homework-wechat-bridge`: Queue completed audio homework for delivery to a personal WeChat group bridge without blocking core homework completion.

### Modified Capabilities

- `homework-status-history`: Extend homework completion history to include auto-completion evidence sourced from external learning records.
- `parent-notification-delivery`: Extend reminder and digest infrastructure to support Telegram as a household progress channel.

## Impact

- New data entities for platform accounts, sync jobs, learning events, auto-match results, Telegram deliveries, and voice push tasks.
- New scheduled integration layer for external learning platforms with per-platform sync logic.
- New homework automation workflow that can complete assignments without parent confirmation when same-day evidence is present.
- New outbound delivery path for Telegram and a Beta queue for WeChat-group audio delivery.
- Additional operational requirements around credential handling, duplicate suppression, delivery auditing, failed sync visibility, and first-release correctness guardrails.
