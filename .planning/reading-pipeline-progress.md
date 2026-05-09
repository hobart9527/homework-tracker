# Reading Pipeline — Progress Tracker

Last updated: 2026-05-08

---

## Current Wave

**Wave 6 — Closeout** (state: `completed-with-residual-risk`, topology: `Serial`)

**Completed**:
- W6-T1: Schema fixes (`summary` + `classical_quote` columns added via Management API), topics seeded (114 rows), MiniMax cover response-format bug fixed, EN + ZH pipeline sample batches run, QA passed (15 articles generated, all published), tsc + vitest (421/421) + build all green.
- W6-T2: README + .env.example docs update.

**Residual risk**: Pollinations 429 / timeout prevents cover + illustration generation for ~40% of articles. Fix: add exponential backoff retry to `cover-generator.ts` and `illustration-generator.ts` (deferred to post-Wave-6 follow-up).

## Wave Status

| Wave | State | Tasks | Notes |
|------|-------|-------|-------|
| 0 — Contract Freeze | ✅ done | 4/4 | Authored in `task-plan.md` §3 |
| 1 — Foundation | ✅ integrated | 4/4 | tsc clean, 15/15 tests pass |
| 2 — Generation Foundations | ✅ integrated | 3/3 | tsc clean, 27/27 tests pass (quality-gate 9 + difficulty 10 + storage-uploader 8) |
| 3 — Image Generators | ✅ integrated | 2/2 | T1 ✅, T2 ✅ |
| 3.5 — Content Generator Fix | ✅ integrated | 1/1 | generateReadingContent + buildChinesePrompt/buildEnglishPrompt + types extended |
| 4 — Pipeline Integration | ✅ integrated | 3/3 | T1 reading-content-pipeline.ts, T2 seed-chinese-reading-content.ts, T3 refresh-news/route.ts |
| 5 — Frontend | ✅ integrated | 2/2 | T1 ArticleReader illustrations, T2 ArticleCard polish + API routes |
| 6 — Closeout | 🔄 partial | 1/2 | W6-T1 blocked (env network), W6-T2 docs update ✅ |

**Wave 3 topology change**: T2 illustration-generator imports `cover-style-presets.ts` from T1 → read-after-write edge → Serial, not Wave Parallel. Acceptable cost trade vs duplicating preset map.

---

## Wave 1 — Completed

| ID | Status | Files (write) | Verification |
|----|--------|---------------|--------------|
| W1-T1 | ✅ completed | `supabase/migrations/035_create_reading_topics.sql`, `scripts/migrate-topics-to-db.mjs` | dry-run lists 114 unique topics (en=84, zh=30) |
| W1-T2 | ✅ completed | `supabase/migrations/036_create_reading_illustrations.sql`, `supabase/migrations/037_alter_reading_articles_extras.sql` | manual review (psql/supabase CLI unavailable in env, dispatch authorized) |
| W1-T3 | ✅ completed | `package.json`, `package-lock.json`, `src/lib/reading/pinyin-converter.ts`, `src/components/reading/ArticleReader.tsx`, `tests/unit/pinyin-converter.test.ts` | tsc clean + 7/7 vitest pass |
| W1-T4 | ✅ completed | `src/lib/reading/content-generator.ts`, `src/lib/reading/types.ts`, `src/lib/reading/index.ts`, `tests/unit/reading-content-generator.test.ts` | tsc clean + 8/8 vitest pass |

**Wave 1 integration verification (orchestrator)**: `npx tsc --noEmit` clean; `npx vitest run` 15/15 pass on union of W1-T3 + W1-T4 tests; all 4 file groups exist on disk.

**Wave 1 residual risks**:
- W1-T2 only manual-reviewed (psql/supabase CLI unavailable in agent env). Real `supabase db push` validation deferred to Wave 6 closeout when env credentials available. Acceptable per dispatch authorization.
- W1-T1 surfaced 6 EN category conflicts between sources — first-seen retention applied; W4 may want to reconcile.

---

## Wave 2 — Tasks (dispatched)

| ID | State | Owner | Files (write) | Verification |
|----|-------|-------|---------------|--------------|
| W2-T1 | dispatched | adhd-agent | `src/lib/reading/quality-gate.ts`, `tests/unit/quality-gate.test.ts` | vitest unit tests for 7 check codes |
| W2-T2 | dispatched | adhd-agent | `src/lib/reading/difficulty.ts`, `tests/unit/difficulty.test.ts` | vitest with sample en+zh texts |
| W2-T3 | dispatched | adhd-agent | `src/lib/reading/storage-uploader.ts`, `tests/unit/storage-uploader.test.ts` | mocked supabase client unit test |

**Wave 2 frozen contract additions** (orchestrator-authored, see findings.md for rationale):

```typescript
// storage-uploader.ts (W2-T3 deliverable, consumed by Wave 3)
export interface UploadOptions {
  path: string;                      // e.g. "covers/abc.webp"
  bytes: ArrayBuffer | Uint8Array;
  contentType: string;               // e.g. "image/webp"
  upsert?: boolean;                  // default true
}
export interface UploadResult {
  url: string;                       // Supabase Storage public URL
  bytes: number;
}
export async function uploadToReadingMedia(opts: UploadOptions): Promise<UploadResult>;

export async function downloadAndUploadFromUrl(opts: {
  externalUrl: string;
  path: string;
  fetchTimeoutMs?: number;           // default 30000
}): Promise<UploadResult>;
```

Image resizing: NOT done in storage-uploader. Supabase Storage URL transformations (`?width=800&format=webp&quality=70`) handle resize at request-time; frontend ArticleCard/ArticleReader will append the transform query.

---

---

## Wave 5 — Completed

| ID | Status | Files (write) | Verification |
|----|--------|---------------|--------------|
| W5-T1 | ✅ completed | `src/components/reading/ArticleReader.tsx`, `src/app/api/reading/articles/[id]/route.ts` | tsc clean; illustration rendering per paragraph_index verified |
| W5-T2 | ✅ completed | `src/components/reading/ArticleCard.tsx`, `src/app/api/reading/articles/route.ts`, reading list pages | tsc clean; cover skeleton + category colors verified |

**Wave 5 integration verification (orchestrator)**: `npx tsc --noEmit` clean; `npx vitest run` 6 files 53/53 pass; ArticleReader renders illustrations between paragraphs by `paragraph_index`; ArticleCard shows skeleton loader + category badge colors.

---

## Wave 6 — Tasks

| ID | State | Owner | Files (write) | Verification | Blocker |
|----|-------|-------|---------------|--------------|---------|
| W6-T1 | 🔴 blocked | — | — | Sample QA (10 zh + 10 en, ≥80% pass) | `reading_topics` table missing in DB; migrations 035-037 not yet pushed |
| W6-T2 | ✅ completed | adhd-agent | `README.md`, `.env.example` | Manual review of doc accuracy | — |

**Wave 6 blocker resolution path**:
1. User runs `supabase db push` (or equivalent migration apply) for 035, 036, 037
2. User runs `npx tsx scripts/migrate-topics-to-db.mjs` to seed `reading_topics`
3. Re-run QA with: `PIPELINE_GRADES="3,6" PIPELINE_TOPIC_LIMIT=5 npx tsx scripts/reading-content-pipeline.ts` (en) and `npx tsx scripts/seed-chinese-reading-content.ts` (zh)
4. Inspect generated articles in Supabase dashboard or via API

---

## Decisions Log

- 2026-05-08 user confirmed P0+P1 scope, dual-category, MiniMax+Pollinations split, all-category illustrations
- 2026-05-08 user added: pinyin uses `<rt>` (above), content model unchanged (OpenAI-compat→MiniMax), image ≤ 60KB
- 2026-05-08 orchestrator restructured Wave 2 → 3 (split out storage-uploader read-after-write dep)
- 2026-05-08 orchestrator: image resize done at request-time via Supabase Storage transformations; storage-uploader does not bundle sharp/imagemin (avoids native binary install)
- 2026-05-09 orchestrator: Wave 6-T1 blocked due to unapplied migrations; W6-T2 proceeds independently
