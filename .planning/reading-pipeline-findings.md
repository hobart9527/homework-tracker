# Reading Pipeline — Findings

Last updated: 2026-05-08
Source: orchestrator code investigation 2026-05-08

---

## Current State (pre-refactor)

### Topic List Drift

Hardcoded topic catalogs in 4 separate places:

| File | Topic Count | Language | Has source_text |
|------|-------------|----------|-----------------|
| `scripts/reading-content-pipeline.mjs` | 10 (CURATED_NEWS) | en | yes |
| `scripts/seed-reading-content.mjs` | 60 (TOPICS + SOURCE_TEXTS Map) | en | yes |
| `scripts/seed-chinese-reading-content.mjs` | 30 (CHINESE_SEED_TOPICS) | zh | no (LLM invents) |
| `src/app/api/reading/refresh-news/route.ts` | 33 (CURATED_NEWS embedded) | en | yes |

Net unique: ~75-80 distinct topic_keys after dedupe. Several topics duplicated across files (e.g. `moon-return-missions`, `ancient-egypt`, `solar-system-exploration`, `marie-curie`).

### Cover Generation Drift

| Generator | Used in | Source | Result quality |
|-----------|---------|--------|----------------|
| Pollinations.ai | `seed-chinese-reading-content.mjs` (`generateCoverImage`) | free, public CDN | inconsistent style, slow |
| LoremFlickr | `seed-chinese-reading-content.mjs` (`fetchCoverImage`) | stock photos by keyword | photographic, off-tone |
| MiniMax `image-01` | `src/app/api/reading/generate-cover/route.ts` (POST API) | paid, on-demand | better children's-book quality |
| (none) | All 3 English entrypoints | n/a | no covers exist |

### Database Schema

Existing `reading_articles` columns (from migration 030 + 032 + 033 + 034):
- `id, topic_key, title, content, source, source_url, category, grade_level, word_count, estimated_minutes, difficulty, status, created_at`
- `language` (zh/en, migration 032)
- `pinyin_content` (migration 032)
- `summary` (mentioned in code, exact migration TBD)
- `cover_image_url` (migration 034)

Existing tables in reading domain:
- `reading_articles`
- `reading_questions`
- `reading_assignments`
- `reading_quiz_attempts`

### Pinyin Generation Bug

`src/components/reading/ArticleReader.tsx` line ~200 uses `<rp>` (ruby parenthesis) which is fallback-only; pinyin is NOT actually rendered above characters in modern browsers. Should use `<rt>`.

Current zh pipeline asks LLM for `pinyin_content` field with `汉(hàn)` format. LLM-generated pinyin is unreliable for multi-tone characters (行/长/重) and proper noun pronunciations. `pinyin-pro` library handles these correctly.

### Project tooling

- Next.js 14.2.35, React 18.3.1, TypeScript 6.0.2
- OpenAI SDK 6.36.0 (supports image_generation in OpenAI-compatible APIs)
- Supabase JS 2.102.1, Supabase SSR 0.10.0
- Playwright 1.59.1 (used for platform sync)
- Vitest 4.1.3, @testing-library/react 16.3.2
- npm pkg manager (package.json + package-lock.json)
- dotenv 17.4.2 (loads .env.local)

### Env vars in use

- `OPENAI_API_KEY` (also serves MiniMax via OPENAI_BASE_URL)
- `OPENAI_BASE_URL` (defaults to `https://api.openai.com/v1`; production likely points to `https://api.minimaxi.com/v1`)
- `OPENAI_READING_MODEL` (defaults to `gpt-4o-mini`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PIPELINE_GRADES` / `PIPELINE_TOPIC_LIMIT` (cron config)
- `CRON_SECRET` (refresh-news API guard)

### Frontend display

- `ArticleCard.tsx` reads `coverImageUrl` prop, shows aspect 3:2 cropping
- `ArticleReader.tsx` reads `coverImageUrl` + `pinyinContent` + `classicalQuote` props
- Category color map in `ArticleCard.tsx` uses English keys only; Chinese categories (成语故事/寓言/科普/现代文) hit default color

---

## Post-Wave-6 Findings (2026-05-09)

### Schema Drift Discovered During Execution

| Column | Expected By | Actually Present | Fix Applied |
|---|---|---|---|
| `summary` | `content-generator.ts` / pipeline upsert | ❌ Missing | `ALTER TABLE … ADD COLUMN summary TEXT` via Management API |
| `classical_quote` | `seed-chinese-reading-content.ts` upsert | ❌ Missing | `ALTER TABLE … ADD COLUMN classical_quote JSONB` via Management API |

**Root cause**: Migrations 030–037 never included these columns. They were defined in the API contract (`reading-pipeline-task-plan.md` §3.3 / §3.6) but not reflected in SQL.

**Recommended follow-up**: Add migration `038_add_summary_and_classical_quote.sql` for idempotency on fresh installs.

### MiniMax `image_generation` Response Format

**Expected by code** (`cover-generator.ts` pre-fix):
```json
{ "data": [{ "url": "..." }] }
```

**Actual response from MiniMax** (`image-01` model, 2026-05-09):
```json
{ "data": { "image_urls": ["..."] } }
```

**Fix applied**: `cover-generator.ts` now tries `data.image_urls[0]` first, then falls back to `data[0].url` for backward compatibility.

### Pollinations Rate Limiting

**Symptom**: `fetch failed: 429` on nearly all Pollinations calls when two pipelines run concurrently.

**Impact**: ~40% of covers and ~90% of in-article illustrations fail.

**Mitigation applied**: None yet. `cover-generator.ts` + `illustration-generator.ts` need exponential-backoff retry with jitter.

---

## Open Questions (deferred to post-Wave 5)

- Should LoremFlickr usage be deleted (replaced by Pollinations) or kept as second fallback?
- Should historical zh articles run through additional fact-check step (cross-reference with Wikipedia)?
- Should difficulty cross-check trigger auto-regeneration (1 retry) or just flag for human review?
- Should we move CRON_SECRET refresh-news to use Vercel Cron + native env, or keep current header-based check?

---

## Worker Reports

### Wave 1 (2026-05-08)

**W1-T1** (`adhd-agent adcb9ee0`):
- Created 035 migration + migrate-topics-to-db.mjs script
- Dry-run: **114 unique (topic_key, language) entries** (en=84, zh=30)
- 6 EN category conflicts reconciled by first-seen retention; logged
- Topics like `martin-luther-king` vs `martin-luther-king-jr` kept as separate rows (per frozen "no rename" decision)
- Live migration deferred (no env credentials in agent shell)

**W1-T2** (`adhd-agent ae092a6d`):
- Created 036 (reading_article_illustrations + storage bucket policies) and 037 (reading_articles extras + quota table + RPC)
- Adjustment: §3.3 inline `CHECK` on `ADD COLUMN IF NOT EXISTS` moved to separate `ADD CONSTRAINT` in DO/EXCEPTION block — PostgreSQL idempotency reason. Constraint semantics unchanged.
- All policies wrapped in DO/EXCEPTION blocks (matches 030 convention)
- RPC `increment_minimax_quota` uses single-statement `UPDATE … WHERE used_count < daily_limit RETURNING` — atomic per-row lock
- psql/supabase CLI unavailable; manual review only (per dispatch authorization)

**W1-T3** (`adhd-agent a301ed89`):
- pinyin-pro ^3.28.1 installed
- pinyin-converter exports `convertToRubyPinyin(text: string): string` returning `汉字(pīn yīn)` format
- ArticleReader.tsx: `<rp>` → `<rt>` swap; rp retained as fallback parens
- 7/7 vitest pass; tsc clean

**W1-T4** (`adhd-agent ad6e88181`):
- content-generator.ts unified: single `generateReadingContent({language})` entry; en/zh prompt builders inside
- Chinese prompt **does NOT** request `pinyin_content` (verified by test); pinyin generated post-hoc by W1-T3
- types.ts: extended GeneratedArticle with scene_description + optional classical_quote; new GeneratedIllustration
- Backward-compat: legacy `generateArticleContent` retained as wrapper for `refresh-news/route.ts` until Wave 4 migration
- 8/8 vitest pass; tsc clean

### Wave 2 (in progress)

(filled when agents report)

---

## Topology Restructure (Wave 2 → Wave 2 + Wave 3)

**Decision date**: 2026-05-08 (post-Wave-1 barrier)

**Why**: Original Wave 2 task plan put quality-gate, difficulty, cover-generator, illustration-generator in 4-way parallel. cover-generator and illustration-generator both need to upload images to Supabase Storage, requiring a shared `storage-uploader.ts` module. That's a `read-after-write` dependency that violates Wave Parallel constraints.

**New topology**:
- Wave 2 (3 parallel): quality-gate + difficulty + storage-uploader
- Wave 3 (2 parallel): cover-generator + illustration-generator (both import storage-uploader)
- Subsequent Waves shift +1 (former Wave 3 → Wave 4, etc.)

**Net cost**: +1 wave barrier, but clean DAG and no contention on shared infra.

**Storage-uploader contract frozen** (see progress.md §Wave 2 frozen contract additions). Image resize is request-time via Supabase URL transformations, avoiding `sharp` native binary install.
