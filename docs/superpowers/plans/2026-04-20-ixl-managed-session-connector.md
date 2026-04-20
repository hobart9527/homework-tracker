# IXL Managed Session Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-release IXL managed-session connector that stores session metadata, fetches recent activity server-side, and feeds it into the existing learning-event import pipeline with clear failure states.

**Architecture:** Extend `platform_accounts` with optional managed-session fields, add a connector-local IXL fetch/parse layer, and wire a connector execution path into the existing normalized event ingestion flow. Keep the downstream auto-checkin pipeline unchanged and treat expired sessions as `attention_required`.

**Tech Stack:** Next.js route handlers, TypeScript, Supabase, Vitest

---

### Task 1: Persist IXL managed-session metadata on platform accounts

**Files:**
- Modify: `src/app/api/platform-connections/route.ts`
- Modify: `tests/unit/platform-connections.test.ts`
- Modify: `src/lib/supabase/types.ts`
- Create: `supabase/migrations/021_add_platform_account_managed_sessions.sql`

- [ ] Step 1: Write a failing route test for storing `managedSessionPayload`
- [ ] Step 2: Run `npm test -- --run tests/unit/platform-connections.test.ts` and verify the new test fails for missing stored session fields
- [ ] Step 3: Add nullable managed-session columns and update the route to persist them for IXL accounts
- [ ] Step 4: Run `npm test -- --run tests/unit/platform-connections.test.ts` and verify the route tests pass

### Task 2: Add a connector-local IXL fetch and parse layer

**Files:**
- Create: `src/lib/platform-adapters/ixl-fetch.ts`
- Create: `tests/unit/ixl-fetch.test.ts`

- [ ] Step 1: Write a failing parser test for converting an authenticated IXL response into fetched activity records
- [ ] Step 2: Run `npm test -- --run tests/unit/ixl-fetch.test.ts` and verify the test fails because the fetch module does not exist yet
- [ ] Step 3: Implement the minimal fetch helpers for session validation, auth-expired detection, and activity parsing
- [ ] Step 4: Run `npm test -- --run tests/unit/ixl-fetch.test.ts` and verify the tests pass

### Task 3: Add an IXL connector runner

**Files:**
- Create: `src/lib/platform-adapters/ixl-connector.ts`
- Create: `tests/unit/ixl-connector.test.ts`
- Modify: `src/lib/platform-adapters/index.ts`

- [ ] Step 1: Write a failing runner test for rejecting missing sessions and returning normalized events for valid fetched activity
- [ ] Step 2: Run `npm test -- --run tests/unit/ixl-connector.test.ts` and verify the test fails for missing connector logic
- [ ] Step 3: Implement the minimal connector runner around the fetch layer and existing IXL normalization
- [ ] Step 4: Run `npm test -- --run tests/unit/ixl-connector.test.ts` and verify the tests pass

### Task 4: Integrate connector execution into the import path

**Files:**
- Modify: `src/app/api/platform-sync/import/route.ts`
- Modify: `tests/unit/platform-sync-import-route.test.ts`

- [ ] Step 1: Write a failing route test for `fetchMode: "managed_session"` on an IXL account
- [ ] Step 2: Run `npm test -- --run tests/unit/platform-sync-import-route.test.ts` and verify the new test fails
- [ ] Step 3: Add the minimal route integration that runs the IXL connector and imports each normalized event
- [ ] Step 4: Run `npm test -- --run tests/unit/platform-sync-import-route.test.ts` and verify the route tests pass

### Task 5: Verify the full IXL connector slice

**Files:**
- Modify: `tests/unit/platform-sync-import-route.test.ts`
- Modify: `tests/unit/platform-connections.test.ts`
- Modify: `tests/unit/ixl-fetch.test.ts`
- Modify: `tests/unit/ixl-connector.test.ts`

- [ ] Step 1: Run the focused connector test set with `npm test -- --run tests/unit/platform-connections.test.ts tests/unit/ixl-fetch.test.ts tests/unit/ixl-connector.test.ts tests/unit/platform-sync-import-route.test.ts`
- [ ] Step 2: Fix any red tests with the smallest possible code changes
- [ ] Step 3: Re-run the focused connector test set and verify all tests pass
