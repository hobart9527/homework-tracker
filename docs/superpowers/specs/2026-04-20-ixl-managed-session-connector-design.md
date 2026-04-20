# IXL Managed Session Connector Design

## Context

The current `homework-tracker` branch already supports:

- platform account records
- sync job claiming and completion
- normalized learning event ingestion
- IXL raw-event normalization for already-shaped payloads

What it does not support yet is a real IXL connector that fetches activity from IXL on the server. The first release should stay narrow and practical: use a managed authenticated session captured for one bound IXL account, fetch recent activity on the server, translate it into the existing learning-event pipeline, and fail visibly when the session is no longer usable.

## Goal

Add a first-release IXL connector that:

- stores managed-session metadata for an IXL platform account
- fetches recent IXL activity server-side using that session
- normalizes the fetched records into the existing learning-event model
- runs through the existing auto-checkin flow
- marks the platform account `attention_required` when the IXL session is invalid or expired

## Non-Goals

- automatic username/password login to IXL
- browser automation in the first release
- a generic encrypted secret vault abstraction for all future connectors
- changing the downstream homework matching rules
- implementing the Khan Academy real connector in this slice

## Recommended Approach

Use a managed-session HTTP connector for IXL.

The app stores a server-side session snapshot on the `platform_accounts` record, limited to the cookie/header values needed for authenticated requests plus lightweight metadata such as capture time and expiry hints. Scheduled or manual sync code loads that snapshot, fetches one stable IXL activity source, parses records into a connector-local raw shape, then hands each record to the existing IXL normalization and import pipeline.

If the fetch returns an authentication failure, missing logged-in markers, or an empty page shape that clearly indicates session expiry, the connector must stop and mark the account `attention_required` with a human-readable failure summary.

## Data Changes

The connector needs a small extension to `platform_accounts`:

- `managed_session_payload JSONB NULL`
- `managed_session_captured_at TIMESTAMPTZ NULL`
- `managed_session_expires_at TIMESTAMPTZ NULL`
- `last_sync_error_summary TEXT NULL`

These fields are only required for connectors that use managed sessions. They are nullable so existing non-IXL accounts remain valid.

## Architecture

### 1. Account binding and session storage

The platform connection route should accept optional managed-session payload input for IXL. The route validates the parent-child ownership boundary exactly as it does today, then stores the session snapshot and leaves the account in either:

- `active` when a managed session is present
- `attention_required` when the account exists but has no usable session yet

This keeps the current account binding model but makes session readiness explicit.

### 2. IXL fetch client

Create a focused server-side module responsible for:

- building authenticated HTTP requests from the stored session snapshot
- fetching the recent activity page or endpoint
- detecting auth-expired responses
- parsing remote payloads into a connector-local `IxlFetchedActivity` shape

This module should not know about Supabase or homework logic.

### 3. IXL sync runner

Create a small orchestration layer that:

- receives a platform account
- validates the account is an IXL account with a usable managed session
- fetches recent IXL activities
- normalizes each fetched activity through `normalizeIxlLearningEvent`
- returns normalized events plus a fetch summary

This layer owns connector-specific error mapping such as `attention_required` versus transient failure.

### 4. Import route integration

The existing platform-sync import path should remain the single ingestion path for one normalized event. For the first release, add a connector-facing route or helper path that:

- loads the account
- runs the IXL sync runner
- feeds each normalized event through the existing learning-event import + auto-checkin flow
- completes or fails the sync job with a fetch summary

This avoids duplicating the downstream ingestion logic.

### 5. Scheduled sync integration

The scheduled sync route currently only claims jobs. For this slice, keep that behavior unless there is already a worker pattern in the repo. The first implementation can focus on:

- manual execution path for one IXL account
- connector library that later scheduled workers can call

This keeps the slice deliverable without overcommitting to a full runtime redesign.

## Error Handling

Use these rules:

- missing managed session: treat as `attention_required`
- explicit auth failure or expired-session markers from IXL: treat as `attention_required`
- parse failure due to unexpected page structure: treat as `failed` and preserve a short failure summary
- duplicate learning event ingest: treat as successful connector execution with duplicate ingest status

The account should only move back to `active` after a successful fetch using a valid session.

## Testing Strategy

Add focused tests for:

- storing managed-session metadata during IXL account binding
- rejecting auto-fetch when no managed session exists
- parsing a representative IXL activity payload into connector-local records
- detecting expired session responses
- feeding fetched records into the existing normalized import path
- updating account and job status correctly on auth failure

## Success Criteria

This slice is complete when:

- an IXL account can store a managed session snapshot
- server code can fetch and parse at least one recent IXL activity shape
- fetched records flow into `learning_events` through existing normalization/import logic
- expired sessions visibly move the account to `attention_required`
- the new behavior is covered by focused unit tests
