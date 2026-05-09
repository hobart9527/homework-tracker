# Execution Framework Fixes — Post-Mortem Implementation

Created: 2026-05-09
Status: Applied

---

## Background

Post-mortem of the 3-stage design overhaul (Stage 1 Token System → Stage 2 iPad Layout → Stage 3 Reader Mode) identified 5 framework-level vulnerabilities. This document records the fixes applied to prevent recurrence.

## Vulnerabilities & Fixes

### P0-1: Completion Evidence Verification Gap ("No Diff" Completion Trap)

**Problem**: Wave Barrier accepted analysis reports as completion. Agent returned "discovered rollback issue" without actual file mutation → marked as completed.

**Fix applied to `~/.claude/agents/orchestrator.md`**:
- Wave Barrier now **cross-checks `git status --short`** against each task's claimed changed files
- If `git status` shows a write-scope file is unmodified when the task claims it was changed → mark `partial` with blocker `diff_mismatch`
- Wave Barrier runs **`git diff --stat`** to verify actual diff exists for every completed write-task

**Fix applied to `~/.claude/agents/adhd-agent.md`**:
- **Write-after-verify discipline**: Every Edit/Write must be followed by Read to confirm mutation persisted
- If Read shows modification not present → retry once → still fail → return `partial` with `write-verification-failed`

---

### P0-2: Verification Matrix Escalator Missing (Test Delay)

**Problem**: Stage 2 waves only verified `npm run build`. 3 test failures introduced in Stage 2.2 DOM refactor were not caught until Stage 3.3b.

**Fix applied to `~/.claude/agents/orchestrator.md`**:
- Added explicit **Wave-level verification matrix table**:
  - Micro: diff + format
  - Light: build/typecheck OR test
  - **Standard: build + typecheck + test (must run)**
  - Heavy: build + typecheck + test + manual review
- **Build pass alone is NEVER sufficient for Standard/Heavy wave completion**

---

### P1-3: Git Status Snapshot Missing

**Problem**: Wave 1.0 modified `tailwind.config.ts`, but Wave 1.3a discovered it had been git reset. No intermediate wave checked git status.

**Fix**: Covered by P0-1 fixes above — every Wave Barrier now runs `git status --short` + `git diff --stat`.

---

### P1-4: No Write-Then-Verify Loop

**Problem**: Agent assumed file write succeeded because the tool call returned without error. Rollback happened silently.

**Fix**: Covered by P0-1 adhd-agent fix — mandatory Read-after-Write confirmation.

---

### P2-5: Context Recovery Overhead

**Problem**: PreCompact recovery required manual reconstruction of wave state. `state_read/write` tools existed but were not used.

**Fix applied to `~/.claude/agents/orchestrator.md`**:
- **State persistence gate**: For Standard/Heavy/multi-Wave work, `state_write(mode="orchestrator")` must succeed at wave start and wave end
- If state tools unavailable → report as residual risk

---

## Files Modified

| File | Change |
|------|--------|
| `~/.claude/agents/orchestrator.md` | Added git cross-check, verification matrix, state persistence gate |
| `~/.claude/agents/adhd-agent.md` | Added write-after-verify discipline, Read-after-Write requirement |

## Verification

- [x] All edits applied without conflicts
- [ ] Next Standard/Heavy wave will exercise these new gates

## Rollback

```bash
# Restore original prompts from git (if tracked)
git checkout ~/.claude/agents/orchestrator.md ~/.claude/agents/adhd-agent.md
```
