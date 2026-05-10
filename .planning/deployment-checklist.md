# Reading Pipeline Deployment Checklist (A1-A4)

> Created: 2026-05-10
> Owner: orchestrator
> Scope: apply migrations 035-040, regenerate Supabase types, seed 153 topics
> Pre-status: 6 commits in working tree (c31a64a..b378c84) on `main`, working tree clean

---

## 0. Pre-flight (must pass before A1)

```bash
cd /Users/Shared/projects/homework-tracker

# 0.1 Confirm working tree is clean
git status --short
# expected: empty output

# 0.2 Confirm 6 commits are on the branch
git log --oneline -6
# expected: c31a64a fix → 1382a68 feat → a7c0854 feat → 61ba307 feat → b8c0057 feat → b378c84 chore

# 0.3 Confirm migrations 035-040 exist on disk
ls supabase/migrations/03[5-9]*.sql supabase/migrations/040*.sql
# expected:
# supabase/migrations/035_create_reading_topics.sql
# supabase/migrations/036_create_reading_illustrations.sql
# supabase/migrations/037_alter_reading_articles_extras.sql
# supabase/migrations/038_topic_packs_v2.sql
# supabase/migrations/039_per_child_reading_v2.sql
# supabase/migrations/040_reading_audios_bucket.sql

# 0.4 Confirm .env.local has the required keys
grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN)=" .env.local | sed 's/=.*/=<set>/'
# expected: all 3 lines printed (values masked)
# if SUPABASE_ACCESS_TOKEN missing: get it from
#   https://supabase.com/dashboard/account/tokens

# 0.5 Confirm supabase CLI is available and you're logged in
supabase --version
supabase projects list | head
# expected: project list includes homework-tracker

# 0.6 (Optional but recommended) Backup current schema dump
mkdir -p .planning/snapshots
supabase db dump --file ".planning/snapshots/pre-deploy-$(date +%Y%m%d-%H%M).sql"
```

If 0.4 fails — set the missing key in `.env.local` first. Do NOT proceed to A1 with an incomplete env.

---

## A1 + A2 — Apply migrations 035-040 (one push)

`supabase db push` applies every migration that is not yet recorded in the project's `schema_migrations` table. 035-037 may already be partially applied (manual fixes were made via Management API in the prior session — see `.planning/reading-pipeline-findings.md` §Schema Drift). Run the dry-run first to see what `db push` will actually apply.

```bash
# A1.1 Dry-run (no DB write) — shows the SQL that would execute
supabase db push --dry-run

# Read the output carefully:
#   - If 035-037 are listed → they were never recorded as applied; the db push
#     will run them. Migrations are idempotent (CREATE IF NOT EXISTS / ADD
#     COLUMN IF NOT EXISTS), so re-running is safe.
#   - If only 038-040 listed → 035-037 are already recorded; only the new ones run.
#   - If error mentions network / auth → fix env (0.4) before retry.

# A1.2 Apply
npm run supabase:migrate
# equivalent to: supabase db push
# expected output ends with: "Finished supabase db push."
```

**Post-A1 verification**:

```bash
# A1.3 Verify the 6 migration files are recorded
supabase migration list
# expected: 035, 036, 037, 038, 039, 040 all show "✓" in remote column
```

If A1.2 fails with "relation already exists" or similar — that's safe to ignore IF the migration is idempotent (035-040 all use `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`). Confirm with the line numbers from the error and the migration file. Otherwise STOP and report.

---

## A3 — Regenerate Supabase TypeScript types

The npm script reads `$PROJECT_ID`. Look up the project ID once and export it.

```bash
# A3.1 Find project ID (one-time)
supabase projects list
# Find the row for homework-tracker; copy the "Reference ID" (e.g. abcdefghijkl)

# A3.2 Export and regenerate
export PROJECT_ID=<paste-reference-id>
npm run supabase:generate-types
# this runs:
#   supabase gen types typescript --project-id $PROJECT_ID > src/lib/supabase/types.ts

# A3.3 Verify it changed
git diff --stat src/lib/supabase/types.ts
# expected: src/lib/supabase/types.ts | <N> +/- (N > 0)
#   the types file should now include topic_packs, the new columns on
#   children/reading_topics/reading_articles, and reading_image_quota_daily.
```

**Sanity-check**: open `src/lib/supabase/types.ts` and grep for `topic_packs` / `reading_audios` / `reading_level_en`. If any of these are missing, the migration probably did NOT apply — go back to A1.

---

## A4 — Seed 153 topics

The seed script defaults to dry-run; you must pass `--execute` for the actual upsert. It reads `.env.local` via dotenv automatically.

```bash
# A4.1 Dry-run first
npx tsx scripts/seed-topic-matrix-v2.ts --dry-run
# expected: prints summary like "Would upsert 30 topic_packs and 153 reading_topics"
#   if it errors with "table topic_packs does not exist" → A1 didn't apply, redo.

# A4.2 Execute
npx tsx scripts/seed-topic-matrix-v2.ts --execute
# expected: prints insertion counts; ends with "Seed complete: 30 packs, 153 topics."

# A4.3 Verify in DB
psql "$DATABASE_URL" -c "select count(*) from topic_packs;"
# expected: ~30
psql "$DATABASE_URL" -c "select count(*) from reading_topics;"
# expected: ≥ 153 (existing 035-seeded rows + 153 new)
psql "$DATABASE_URL" -c "select language, count(*) from reading_topics group by language;"
# expected: zh and en buckets sum to ≥ 153
```

If you don't have `DATABASE_URL` exported, use the Supabase dashboard SQL editor instead.

---

## A5 (preview, not part of A1-A4) — Sample QA

After A1-A4 land successfully, the W6-T1 blocker is cleared. To run sample QA:

```bash
# A5.1 EN pipeline — generate 5 articles per grade
PIPELINE_GRADES="3,6" PIPELINE_TOPIC_LIMIT=5 \
  npx tsx scripts/reading-content-pipeline.ts

# A5.2 ZH pipeline — same
PIPELINE_GRADES="3,6" PIPELINE_TOPIC_LIMIT=5 \
  npx tsx scripts/seed-chinese-reading-content.ts
```

> **Note**: these script names appear in `.planning/reading-pipeline-progress.md` §Wave 6 blocker resolution path. Verify they exist on disk (`ls scripts/ | grep -E "reading-content-pipeline|seed-chinese-reading-content"`) before running. If not present, they may live under a different name; grep `package.json` and `.planning/` for the actual entry points.

A5 is out of scope for this checklist; track separately.

---

## Rollback

### A1 rollback (per migration)

Each migration is additive (new tables, new columns, new RPC, new bucket). To revert one specific migration:

```bash
# Identify the version of the offender (e.g., 040)
supabase migration list

# Rollback by writing a "down" migration manually:
#   - 040 (audios bucket) → DROP STORAGE BUCKET reading-audios; DROP related policies
#   - 039 (per-child v2)  → ALTER TABLE children DROP COLUMN reading_level_en, ...
#                          ALTER TABLE reading_articles DROP COLUMN audio_zh_url, ...
#   - 038 (topic packs v2) → DROP TABLE topic_packs; ALTER TABLE reading_topics DROP COLUMN pack_id, ...
#   - 035-037: see .planning/reading-pipeline-task-plan.md §8 Rollback

# Production-safe: never DROP without taking a snapshot first (step 0.6).
```

### A3 rollback

```bash
git restore src/lib/supabase/types.ts
```

### A4 rollback

```sql
-- supabase dashboard SQL editor or psql
DELETE FROM reading_topics WHERE pack_id IS NOT NULL;
DELETE FROM topic_packs;
```

The seed is upsert; rerunning `--execute` is idempotent for the topics it owns. If unsure, snapshot first (0.6).

---

## Risk Register

| ID | Risk | Mitigation |
|----|------|------------|
| D1 | 035-037 was already partially applied via Management API → `db push` may try to re-create existing objects | All 035-040 migrations use `IF NOT EXISTS` patterns. Verify with `--dry-run` first. |
| D2 | `SUPABASE_ACCESS_TOKEN` missing or expired → `supabase db push` will 401 | 0.4 pre-flight catches this; refresh token at https://supabase.com/dashboard/account/tokens |
| D3 | `PROJECT_ID` env var unset → A3 generates an empty / wrong types file | Hard-stop in A3.1; verify with A3.3 diff |
| D4 | A4 fails with FK violation on `pack_id` | Indicates 038 did not apply. Re-run A1 dry-run, inspect SQL output. |
| D5 | A4 inserts duplicate topics if rerun without --dry-run check | Seed uses `ON CONFLICT (topic_key, language) DO UPDATE`; safe to rerun |
| D6 | regen types overwrites local edits in `src/lib/supabase/types.ts` | The file is auto-generated; do not hand-edit. If you did, stash before A3 |

---

## Estimated Time

| Step | Wall time | Notes |
|------|-----------|-------|
| 0. Pre-flight | 1-2 min | env check + snapshot |
| A1+A2 | 5-15 min | `db push` for 6 migrations |
| A3 | 1-2 min | type regen |
| A4 | 1-3 min | seed upsert (~30 packs + 153 topics) |
| **Total** | **~10-25 min** | |

---

## Quick-paste sequence (after pre-flight)

```bash
cd /Users/Shared/projects/homework-tracker

# A1+A2
supabase db push --dry-run
npm run supabase:migrate
supabase migration list

# A3
export PROJECT_ID=<your-supabase-project-ref-id>
npm run supabase:generate-types
git diff --stat src/lib/supabase/types.ts

# A4
npx tsx scripts/seed-topic-matrix-v2.ts --dry-run
npx tsx scripts/seed-topic-matrix-v2.ts --execute
```

After all 4 land:

- `git diff` should show only `src/lib/supabase/types.ts` as M
- That diff is part of the next commit (e.g., `chore(supabase): regen types after migrations 038-040`); not part of this checklist
- Notify orchestrator → A5 sample QA can proceed
