# Schema Drift Investigation Report

> Created: 2026-05-10
> Owner: orchestrator (read-only investigation)
> Trigger: types regen (commit c2dc2f6 "chore(supabase): regen types after migrations 038-040") exposed 29 tsc errors

## Method

**Method chosen: B (PostgREST column probing) + D (cross-check generated types snapshot)**

Reason for chain:
- `SUPABASE_ACCESS_TOKEN` is **not** present in `.env.local` — only `PROJECT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are set. → Method A (`supabase migration list`) cannot authenticate without the access token (BLOCKER for A, see "Blockers / Gaps" below).
- No `DATABASE_URL` available → Method C (`psql \d`) not usable.
- Method B works: a `select=col` against PostgREST returns `42703` (column does not exist) or `PGRST205` (table not in schema cache) deterministically — these are authoritative for "remote actually has this column/table?".
- Method D corroborates: `src/lib/supabase/types.ts` is the regenerated snapshot of remote schema (commit `c2dc2f6`); whatever it omits is missing from remote.

The two methods agree on every probed item, so we treat the result as authoritative for missing tables / missing columns. They cannot detect remote-side `CHECK` constraints (PostgREST surfaces a column as plain `text` regardless of `CHECK`), so literal-narrowing drift is inferred from `types.ts` — a regenerated string-typed column where the migration declared a `CHECK ... IN (...)` is evidence the constraint did not land.

## Findings

### Migration Application Status

Inferred from per-table / per-column existence probes against the live PostgREST (read-only). "✓ applied" = at least one column from that migration is observable; "✗ missing" = signature columns/tables not present on remote.

| Local migration | Signature object probed | Remote applied | Notes |
|---|---|---|---|
| 001 initial_schema | `homeworks`, `check_ins`, `attachments`, `children`, `parents` | ✓ | base tables exist |
| 004 add_checkpoint_types | `homeworks.required_checkpoint_type` | ✓ | column exists; **CHECK constraint absent** (regen → `string` not `'photo'\|'audio'`) |
| 007 check_in_scoring_fields | `check_ins.proof_type`, `awarded_points`, `is_scored`, `is_late` | ✗ MISSING | all four columns return `42703`; `submitted_at` not probed but same migration |
| 008 unify_photo_proof_type | (depends on 007) | ✗ MISSING (cascade) | n/a — 007 not applied |
| 009 homework_reminders | `homework_reminders` table | ✗ MISSING | `PGRST205` table not in schema cache |
| 010 add_point_deduction | `homeworks.point_deduction` | ✗ MISSING | `42703` |
| 010 homework_reminders_rls | (depends on 009) | ✗ MISSING (cascade) | n/a |
| 011 add_voice_push_tasks | `voice_push_tasks` | ✓ | table present |
| 012 platform_accounts + learning_events | `platform_accounts`, `learning_events` | ✓ | tables present |
| 013 platform_sync_jobs | `platform_sync_jobs` | ✓ | present |
| 014 parent_telegram_recipient | not probed | unknown | low priority |
| 015 notification_deliveries | `notification_deliveries` table | ✗ MISSING | `PGRST205` |
| 016 voice_push_task_idempotency | not probed | unknown | low priority |
| 017 voice_push_attempts | not probed | unknown | low priority |
| 018 homework_auto_matches | `homework_auto_matches` | ✗ MISSING | `PGRST205` |
| 019 learning_event_reviews | `learning_event_reviews` | ✗ MISSING | `PGRST205` |
| 020 add_homework_platform_bindings | `homeworks.platform_binding_platform`, `platform_binding_source_ref` | ✗ MISSING | both `42703` |
| 021 platform_account_managed_sessions | `platform_account_managed_sessions` | ✗ MISSING | `PGRST205` |
| 022 platform_sync_job_retry_fields | not probed | unknown | low priority |
| 023 message_routing_rules | `message_routing_rules` | ✓ | present |
| 023 platform_login_credentials | `platform_login_credentials` | ✗ MISSING | `PGRST205` (collision: two 023 migrations) |
| 024 parent_telegram_bot_token | not probed | unknown | low priority |
| 026 fix_parent_passcode_lookup | not probed | unknown | low priority |
| 027 wechat_groups_and_targets | `wechat_groups`, `wechat_group_targets` | partial | `wechat_groups` present, `wechat_group_targets` MISSING (`PGRST205`) |
| 028 wechat_groups_rls | (depends on 027) | partial cascade | n/a |
| 029 check_in_audio_duration | `check_ins.audio_duration_seconds` | ✓ | column present |
| 030 english_reading_schema | reading_* tables | ✓ | reading stack applied |
| 032 chinese_reading_language | not probed | likely ✓ | reading_* present |
| 033 reading_level_system | `reading_articles` extras visible in types.ts | ✓ | |
| 034 reading_article_cover | columns visible in types.ts | ✓ | |
| 035 create_reading_topics | `reading_topics` visible in types.ts | ✓ | |
| 036 create_reading_illustrations | `reading_article_illustrations` in types.ts | ✓ | |
| 037 alter_reading_articles_extras | reading_articles extras in types.ts | ✓ | |
| 038 topic_packs_v2 | `topic_packs` in types.ts | ✓ | |
| 039 per_child_reading_v2 | reading_assignments in types.ts | ✓ | |
| 040 reading_audios_bucket | storage-only | n/a | not visible via PostgREST table probe |

**Critical pattern**: A *contiguous block* of "platform / reminder / scoring" migrations between **007 and 023** never landed remotely, while the *reading* stack (030–040) did. Strongly suggests a long-running drift where someone applied reading migrations selectively (or via repair / squash) and the older platform/scoring stack was bypassed. Migrations 007, 009, 010, 015, 018, 019, 020, 021, 023 (login_credentials), 027 (targets) are all unapplied.

### Drift Summary

Severity: P0 = blocks runtime / type errors block build; P1 = blocks feature; P2 = quality of types only.

| Column / Table | Expected migration | Remote status | References in code (sample) | Severity |
|---|---|---|---|---|
| `check_ins.proof_type` | 007 | MISSING (`42703`) | `auto-checkins.ts:92`, `tasks/check-in-submission.ts:23,74,113-114`, `tasks/daily-task.ts:72` | P0 |
| `check_ins.awarded_points` | 007 | MISSING (`42703`) | `auto-checkins.ts:89`, `tasks/check-in-submission.ts:20,71,106-107,133`, `tasks/daily-task.ts:8,69` | P0 |
| `check_ins.is_scored` | 007 | MISSING (`42703`) | `(child)/rewards/page.tsx:199`, `auto-checkins.ts:90`, `tasks/point-deduction.ts:58`, `tasks/check-in-submission.ts:21,72,109`, `tasks/daily-task.ts:6,50` | P0 |
| `check_ins.is_late` | 007 | MISSING (`42703`) | `(child)/rewards/page.tsx:200`, `auto-checkins.ts:91`, `tasks/check-in-submission.ts:22,73,111-112`, `tasks/daily-task.ts:7,67` | P0 |
| `check_ins.submitted_at` | 007 | MISSING (cascade, not directly probed) | (likely referenced by ordering / scoring code) | P1 |
| `homeworks.point_deduction` | 010 | MISSING (`42703`) | `parent/ParentChildTaskList.tsx:47`, `parent/HomeworkForm.tsx:88,662,666`, `lib/homework-form.ts:15,53,100`, `tasks/point-deduction.ts:25` | P0 |
| `homeworks.platform_binding_platform` | 020 | MISSING (`42703`) | `parent/ParentChildTaskList.tsx:52`, `parent/HomeworkForm.tsx:88-92,235,253,259,753-757`, `learning-event-auto-checkins.ts:50` | P0 |
| `homeworks.platform_binding_source_ref` | 020 | MISSING (`42703`) | `parent/ParentChildTaskList.tsx:53`, `parent/HomeworkForm.tsx:93,773,777`, `learning-event-auto-checkins.ts:51,125,176,183` | P0 |
| `homeworks.required_checkpoint_type` literal narrowing | 004 (`COMMENT` only — no `CHECK`) | column exists, **typed `string`** in regen, code expects `'photo'\|'audio'\|null` | `(parent)/homework/page.tsx:185-186`, `parent/ParentChildTaskList.tsx:51`, `child/ChildHomeworkCard.tsx:63,98,189-190`, `child/CheckInModal.tsx:221` | P1 |
| `homeworks.repeat_type` literal narrowing | 001 | column exists, **typed `string`** in regen, code likely expects `'daily'\|'weekly'\|'interval'\|'once'` | (not in 9 listed files but likely surfaces in `homework-form.ts`) | P2 |
| `notification_deliveries` (whole table) | 015 | MISSING (`PGRST205`) | not in 9 listed files but referenced by reminder dispatch / status enum drift would surface here | P1 |
| `homework_reminders` (whole table) | 009 | MISSING (`PGRST205`) | reminder feature blocked | P1 |
| `homework_auto_matches` (whole table) | 018 | MISSING (`PGRST205`) | auto-match feature blocked | P1 |
| `learning_event_reviews` (whole table) | 019 | MISSING (`PGRST205`) | review feature blocked | P1 |
| `homework_platform_bindings` (whole table) | 020 | MISSING (`PGRST205`) | bind feature blocked (column-level dupe of P0 above) | P1 |
| `platform_account_managed_sessions` (whole table) | 021 | MISSING (`PGRST205`) | platform sync feature blocked | P1 |
| `platform_login_credentials` (whole table) | 023 | MISSING (`PGRST205`) | platform login feature blocked | P1 |
| `wechat_group_targets` (whole table) | 027 | MISSING (`PGRST205`) | wechat target routing feature blocked | P2 |
| `platform_accounts.status` enum drift | 012 (created), code expects `'active'\|'attention_required'\|'failed'\|'syncing'` | column exists; current row has `"active"`; literal narrowing not enforced — regen yields `string` | (status branching logic across parent dashboard) | P2 |
| `notification_deliveries.status` enum | 015 | table missing → enum N/A | n/a | (P1 covered above) |

P0 column count: **7** (proof_type, awarded_points, is_scored, is_late, point_deduction, platform_binding_platform, platform_binding_source_ref) — exceeds the ≥5 acceptance threshold.

### Affected Source Files

(within declared read_scope; line numbers are first reference per file, full set in Drift Summary above)

| File | First-touch lines |
|---|---|
| `src/lib/supabase/types.ts` | regen-affected blocks: `check_ins:` L49, `homeworks:` L210, `platform_accounts:` L457; `notification_deliveries` / `homework_reminders` / `homework_auto_matches` / `learning_event_reviews` / `homework_platform_bindings` / `platform_account_managed_sessions` / `platform_login_credentials` / `wechat_group_targets` blocks **absent** |
| `src/lib/tasks/check-in-submission.ts` | L20–23, 71–74, 106–114, 133 |
| `src/lib/tasks/daily-task.ts` | L6–8, 50, 67–69, 72 |
| `src/lib/tasks/point-deduction.ts` | L25, 58 |
| `src/lib/learning-event-auto-checkins.ts` | L50–51, 125, 176, 183 |
| `src/lib/parent-dashboard.ts` | not directly probed for columns above; expected to consume `awarded_points` / `point_deduction` aggregates — likely affected (verify in fix Wave) |

(Out of read_scope but visible from grep — informational only, do NOT touch in any fix Wave without re-scoping):
- `src/lib/auto-checkins.ts` L89–92
- `src/app/(child)/rewards/page.tsx` L199–200
- `src/app/(parent)/homework/page.tsx` L185–186
- `src/components/parent/ParentChildTaskList.tsx` L47–53
- `src/components/parent/HomeworkForm.tsx` L88–93, 235, 253, 259, 662–666, 753–777
- `src/components/child/ChildHomeworkCard.tsx` L63, 98, 189–190
- `src/components/child/CheckInModal.tsx` L221
- `src/lib/homework-form.ts` L15, 53, 100

## Recommendation

**Recommend: Option D — Apply missing migrations to remote, then regen types.**

Reasoning:

1. **Code intent and migration files agree** — both encode 7 P0 columns and 7 missing feature tables. The drift is "remote is behind", not "code went off-spec". This makes A (revert types) and B (rewrite code to match remote) net-negative: both would mean **deleting working features** (point deductions, scoring, late tracking, platform bindings, reminders, reviews, auto-matches, login credentials, managed sessions, wechat group targets — about 9 features).
2. **Volume is too large for code adaptation** — 7 missing columns plus 7 missing tables span ~15+ source files. Option B would be a multi-week refactor, much larger than the migration backfill.
3. **Migrations look idempotent and additive** — sampled `004` and `007` use `ADD COLUMN IF NOT EXISTS`; risk of replay collisions on already-applied migrations is low. The contiguous unapplied set (007, 009, 010, 015, 018, 019, 020, 021, 023, 027) is well-bounded, so a `supabase migration repair` + targeted `db push` is feasible.
4. **A is acceptable as a *temporary* unblock** if the regen commit (`c2dc2f6`) is blocking other work right now: revert just that single commit on a branch and document drift, then proceed to D in a controlled migration Wave. But the durable answer is D.
5. **B is not recommended** — would force schema-truth to be "whatever remote currently has", causing future migrations to reintroduce drift in the opposite direction.

Suggested execution order if D is approved:
- (a) Backup remote DB (Supabase dashboard → Database → Backups; ensure point-in-time available).
- (b) Run `supabase migration list --project-ref <PROJECT_ID>` (requires `SUPABASE_ACCESS_TOKEN`) to confirm remote-recorded migrations vs `supabase/migrations/` directory.
- (c) For migrations the remote has *recorded* but not *applied* (drifted record): `supabase migration repair --status reverted <id>`, then `supabase db push` from `main`.
- (d) For unrecorded missing migrations: `supabase db push` directly.
- (e) Re-run `supabase gen types typescript` and verify diff against `c2dc2f6` reduces to literal-narrowing additions only.
- (f) Run `npx tsc --noEmit` — expect 29 errors → 0 (or confined to enum literal mismatches if `CHECK` constraints didn't land).

## Reproduce

Commands actually executed during this investigation (read-only). Tokens omitted; substitute `$SUPABASE_URL` / `$SERVICE_KEY` from `.env.local`.

```bash
cd /Users/Shared/projects/homework-tracker

# 1) env probe (presence only)
grep -E "^(PROJECT_ID|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|DATABASE_URL)=" .env.local | sed 's/=.*$/=<set>/'

# 2) per-column probes (returns 200 with row OR 400 + 42703)
SUPABASE_URL=$(awk -F= '/^NEXT_PUBLIC_SUPABASE_URL=/ {print $2}' .env.local | tr -d '"')
SERVICE_KEY=$(awk -F= '/^SUPABASE_SERVICE_ROLE_KEY=/ {print $2}' .env.local | tr -d '"')
for q in \
  "homeworks?select=id,required_checkpoint_type&limit=1" \
  "homeworks?select=id,point_deduction&limit=1" \
  "homeworks?select=id,platform_binding_platform&limit=1" \
  "homeworks?select=id,platform_binding_source_ref&limit=1" \
  "homeworks?select=id,repeat_type&limit=1" \
  "check_ins?select=id,proof_type&limit=1" \
  "check_ins?select=id,awarded_points&limit=1" \
  "check_ins?select=id,is_scored&limit=1" \
  "check_ins?select=id,is_late&limit=1" \
  "check_ins?select=id,audio_duration_seconds&limit=1" \
  "platform_accounts?select=id,status&limit=1" \
  "notification_deliveries?select=id,status&limit=1"; do
  curl -sS -o /tmp/probe_out -w "HTTP=%{http_code}\n" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    "$SUPABASE_URL/rest/v1/$q"
  head -c 300 /tmp/probe_out; echo
done

# 3) per-table existence probes (returns 200 / 404+PGRST205)
for tbl in homework_reminders voice_push_tasks platform_sync_jobs learning_events \
           learning_event_reviews homework_auto_matches homework_platform_bindings \
           platform_account_managed_sessions platform_login_credentials \
           wechat_groups wechat_group_targets message_routing_rules; do
  code=$(curl -sS -o /tmp/probe_out -w "%{http_code}" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    "$SUPABASE_URL/rest/v1/$tbl?select=*&limit=0")
  echo "$tbl => HTTP $code"
done

# 4) cross-check generated snapshot
grep -nE '^\s{6}[a-z_]+: \{$' src/lib/supabase/types.ts
git show HEAD:src/lib/supabase/types.ts | sed -n '49,300p'
```

## Risk Notes

- **Service key in `.env.local`** — entire investigation used the service role key. Never log raw header values; this report stores only redacted markers.
- **Method B blind to constraints** — PostgREST cannot tell us whether a `CHECK (proof_type IN ('photo','audio'))` actually landed. Even if `D` is executed, regen may still produce `string` types if `004`'s `COMMENT ON COLUMN` is the only constraint (it is — `004` adds no `CHECK`). Adding a `CHECK` constraint is a follow-up migration, not in any of `001–040`.
- **Two `010_` files and two `023_` files** in `supabase/migrations/`: `010_add_point_deduction.sql` + `010_homework_reminders_rls.sql`, and `023_add_message_routing_rules.sql` + `023_add_platform_login_credentials.sql`. Lexical ordering by Supabase CLI may apply these in an unintended order. Verify with `supabase migration list` before `db push`.
- **Migration 040 is storage-bucket only** — D's regen step won't reflect 040 in `types.ts`; that's expected, not drift.
- **No backups verified** — option D MUST be preceded by a fresh PITR/backup confirmation before push.
- **Out-of-scope files referenced** — at least 8 components/pages outside the declared `read_scope` rely on the missing columns. Any fix Wave will need a re-scoping by orchestrator.

## Blockers / Gaps

- `SUPABASE_ACCESS_TOKEN` missing → cannot run `supabase migration list`, cannot enumerate which migrations the **`supabase_migrations.schema_migrations` table** records as applied. The "applied vs missing" verdicts above are **inferred from object presence**, not from migration metadata. To distinguish "never recorded" vs "recorded but reverted" requires the access token.
- `DATABASE_URL` missing → cannot use `psql \d` for definitive constraint inspection.
- These gaps do not block this investigation's findings (column-level probes are decisive for "missing column"), but they DO block step (b) of the recommended option-D plan. Orchestrator should obtain `SUPABASE_ACCESS_TOKEN` before kicking off any fix Wave.
