# Reading Pipeline Optimization — Task Plan

Created: 2026-05-08
Owner: orchestrator
Scope: Improve homework-tracker English/Chinese reading content generation, cover, and illustration pipelines.

---

## 1. Goal

Raise reading content quality, make category-fit visible (different look per category), and improve generation efficiency, while consolidating 4 drifted topic lists and 3 inconsistent cover paths into a single source of truth.

---

## 2. Frozen Decisions (do not re-debate without orchestrator approval)

| # | Item | Decision |
|---|------|----------|
| 1 | Scope | P0 + P1 (9 items) |
| 2 | Categories | Keep dual-system: en (时事/历史/科学/人物/自然/文化, 6) + zh (成语故事/寓言/历史/现代文/科普, 5) |
| 3 | Cover image source | MiniMax `image-01` primary, daily quota = 50; on quota-exhaust or failure → fallback to Pollinations |
| 4 | In-article illustration source | Pollinations (free); cover Wave 4 frontend; 1-2 per article, ALL categories |
| 5 | Image storage | Persist to Supabase Storage `reading-media` bucket; DB stores internal URL; preserve external URL as `*_source_url` for traceability |
| 6 | Pinyin | `pinyin-pro` library, server-side; format `汉(hàn)` retained; render with `<rt>` (above) not just `<rp>` |
| 7 | Cover style presets | 8 presets, category-specific (per spec in §6) |
| 8 | Difficulty rating | Flesch-Kincaid (en) + sentence-length / high-frequency-character coverage (zh) + LLM self-rating cross-check |
| 9 | Publish gate | Default `status="draft"`; auto `published` only after quality gate passes |
| 10 | Topic source-of-truth | Single Supabase table `reading_topics`; 4 hardcoded copies migrated then removed |
| 11 | Content-generation model | Continue using OPENAI_BASE_URL pointing to MiniMax-compatible endpoint; do not swap |
| 12 | Image target spec | 800×533 WebP, quality 70-75, target ≤ 60KB |
| 13 | In-article illustration coverage | All categories, 1-2 illustrations per article |

---

## 3. Wave 0 Contract Freeze (orchestrator-authored)

### 3.1 `reading_topics` schema

```sql
create table reading_topics (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null,
  language text not null check (language in ('zh','en')),
  category text not null,
  source_text text,                  -- nullable for zh
  source_url text,
  target_grades int[] not null default '{}',
  image_tier text default 'standard',-- reserved for P2 model-tier routing
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_key, language)
);

create index reading_topics_lang_status on reading_topics (language, status);
create index reading_topics_category on reading_topics (category);
```

### 3.2 `reading_article_illustrations` schema

```sql
create table reading_article_illustrations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references reading_articles(id) on delete cascade,
  paragraph_index int not null,
  image_url text not null,           -- Supabase Storage URL after upload
  source_url text,                   -- external CDN URL kept for traceability
  source text check (source in ('minimax','pollinations')),
  scene_description text,
  created_at timestamptz not null default now()
);

create index reading_article_illustrations_article on reading_article_illustrations (article_id, paragraph_index);
```

### 3.3 `reading_articles` extras

```sql
alter table reading_articles add column if not exists scene_description text;
alter table reading_articles add column if not exists cover_source text check (cover_source in ('minimax','pollinations'));
alter table reading_articles add column if not exists cover_source_url text;  -- traceability
alter table reading_articles add column if not exists quality_issues jsonb;
```

### 3.4 Storage bucket

- Bucket name: `reading-media`
- Public read: yes
- Service role write only
- Path layout: `covers/{articleId}.webp`, `illustrations/{articleId}/{paragraphIndex}.webp`

### 3.5 Daily image quota

```sql
create table reading_image_quota_daily (
  date date primary key,
  used_count int not null default 0,
  daily_limit int not null default 50
);

-- Atomic increment RPC
create or replace function increment_minimax_quota(p_date date, p_limit int)
returns boolean as $$
declare current_used int;
begin
  insert into reading_image_quota_daily (date, used_count, daily_limit)
  values (p_date, 0, p_limit)
  on conflict (date) do nothing;

  update reading_image_quota_daily
  set used_count = used_count + 1
  where date = p_date and used_count < daily_limit
  returning used_count into current_used;

  return current_used is not null;
end;
$$ language plpgsql;
```

### 3.6 `content-generator.ts` API contract

```typescript
// Single source of truth for content generation
export interface GenerateReadingOptions {
  topicKey: string;
  language: "zh" | "en";
  category: string;
  gradeLevel: number;
  sourceText?: string;  // optional for zh
}

export interface GeneratedArticle {
  title: string;
  content: string;
  summary: string;
  word_count: number;
  estimated_minutes: number;
  difficulty: number;            // 1-5, LLM self-rating; cross-checked by quality-gate
  scene_description: string;     // single sentence, used for cover prompt
  classical_quote?: { original: string; pinyin: string; translation: string };  // zh only
}

export interface GeneratedIllustration {
  paragraph_index: number;
  scene_description: string;
}

export interface GeneratedQuestion {
  question_text: string;
  question_type: "main_idea" | "detail" | "inference" | "vocabulary" | "sequence";
  options: { label: string; text: string }[];
  correct_answer: string;
  difficulty: number;
}

export async function generateReadingContent(opts: GenerateReadingOptions): Promise<{
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  illustrations: GeneratedIllustration[];
}>;
```

### 3.7 `cover-generator.ts` API contract

```typescript
export interface GenerateCoverOptions {
  articleId: string;
  language: "zh" | "en";
  category: string;
  scene: string;        // article.scene_description
  title: string;
}

export interface CoverResult {
  url: string;              // Supabase Storage URL
  source: "minimax" | "pollinations";
  source_url: string;       // external CDN URL for audit
  bytes: number;
}

export async function generateCover(opts: GenerateCoverOptions): Promise<CoverResult>;
```

### 3.8 `illustration-generator.ts` API contract

```typescript
export interface GenerateIllustrationsOptions {
  articleId: string;
  language: "zh" | "en";
  category: string;
  scenes: { paragraphIndex: number; sceneDescription: string }[];
}

export type IllustrationResult = {
  paragraph_index: number;
  url: string;            // Supabase Storage URL
  source_url: string;
  source: "pollinations";
  bytes: number;
}[];

export async function generateIllustrations(opts: GenerateIllustrationsOptions): Promise<IllustrationResult>;
```

### 3.9 `quality-gate.ts` API contract

```typescript
export interface QualityGateInput {
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  language: "zh" | "en";
  gradeLevel: number;
}

export interface QualityGateResult {
  pass: boolean;                            // gate result
  recommended_status: "published" | "draft";
  issues: { code: string; severity: "info"|"warn"|"error"; message: string }[];
}

export function validateContent(input: QualityGateInput): QualityGateResult;
```

Quality gate checks:
- `word-count-out-of-range` (warn at 20% deviation, error at 50%)
- `question-correct-not-in-options` (error)
- `question-multiple-correct` (error)
- `question-type-distribution-skew` (warn if all one type)
- `difficulty-vs-word-count-mismatch` (info)
- `pinyin-char-count-mismatch` (zh only, error if mismatched)
- `classical-quote-not-in-content` (zh only, warn)

---

## 4. Task Graph (Waves)

### Wave 0 — Contract Freeze (DONE — authored above)

### Wave 1 — Foundation (4 parallel)
- **W1-T1** Migration 035 + topics data migration script
- **W1-T2** Migration 036 (illustrations) + 037 (article extras + quota table)
- **W1-T3** pinyin-pro install + converter lib + ArticleReader `<rp>`→`<rt>` fix
- **W1-T4** content-generator.ts refactor as single source

### Wave 2 — Generation Core (4 parallel)
- **W2-T1** quality-gate.ts
- **W2-T2** difficulty.ts
- **W2-T3** cover-generator.ts (MiniMax + quota + Pollinations fallback + Storage)
- **W2-T4** illustration-generator.ts (Pollinations + Storage)

### Wave 3 — Pipeline Integration (3 parallel)
- **W3-T1** scripts/reading-content-pipeline.mjs refactor
- **W3-T2** scripts/seed-chinese-reading-content.mjs refactor
- **W3-T3** src/app/api/reading/refresh-news/route.ts refactor

### Wave 4 — Frontend (2 parallel)
- **W4-T1** ArticleReader.tsx render in-article illustrations per paragraph
- **W4-T2** ArticleCard.tsx + reading list page placeholder/loading polish

### Wave 5 — Closeout (2 sequential)
- **W5-T1** Integration verification + sample QA (10 articles × 2 languages, read-only review lane)
- **W5-T2** Update README, AGENTS.md, .env.example

---

## 5. Acceptance per Wave

### Wave 1 acceptance
- 035 migration applies clean; reading_topics has ≥ 100 rows after seed script
- 036/037 migrations apply clean; reading_article_illustrations and quota table created
- Storage bucket `reading-media` created with correct policies
- pinyin-pro installed; pinyin-converter passes 5+ unit tests including 多音字 (行/长/重)
- ArticleReader.tsx renders pinyin **above** characters (rt tag)
- content-generator.ts compiles, has single `generateReadingContent` export with new return shape

### Wave 2 acceptance
- quality-gate.ts unit tests pass for all 7 check codes
- difficulty.ts produces Flesch-Kincaid for en sample, sentence-length+frequency for zh sample
- cover-generator.ts: MiniMax success path + quota-exhaust fallback path + Pollinations failure case all unit-tested with mock fetch
- illustration-generator.ts: Pollinations call returns Storage URL; failure returns empty array (non-blocking)

### Wave 3 acceptance
- All 3 entrypoints read topics from reading_topics table (no hardcoded TOPICS array)
- All 3 entrypoints call generateReadingContent → cover-generator → illustration-generator → quality-gate
- Default `status="draft"` unless gate passes
- Removed CURATED_NEWS hardcoded blocks (or kept as `@deprecated` comment for one release)

### Wave 4 acceptance
- ArticleReader inserts illustrations between paragraphs by paragraph_index
- Cover and illustrations show Storage URLs (no external pollinations.ai/cdn URL in src)
- ArticleCard shows skeleton loader while cover loads

### Wave 5 acceptance
- 10 zh + 10 en sample articles inspected, ≥ 80% pass without manual edits
- README mentions reading_topics, quota, Storage bucket, pinyin-pro
- .env.example documents required env: OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_READING_MODEL, MINIMAX_DAILY_QUOTA

---

## 6. Cover Style Presets (Wave 2 W2-T3 reference)

```typescript
// src/lib/reading/cover-style-presets.ts (created by W2-T3)
export const COVER_STYLES: Record<string, { positive: string; negative: string }> = {
  "成语故事": {
    positive: "traditional Chinese ink painting style, gentle brush stroke, pastel watercolor, animal or character central, story-book illustration",
    negative: "no text, no logo, no scary scene, no violence, child-friendly",
  },
  "寓言": {
    positive: "soft fable storybook illustration, anthropomorphic animals, warm pastel palette, classic children's-book composition",
    negative: "no text, no logo, no scary scene, no violence, child-friendly",
  },
  "历史": {
    positive: "vintage storybook illustration, period-accurate dress and architecture, warm sepia tones, dignified composition",
    negative: "no text, no logo, no battle gore, no violence, child-friendly",
  },
  "人物": {
    positive: "bust portrait illustration, soft pencil with watercolor, warm lighting, era-appropriate background",
    negative: "no text, no logo, child-friendly",
  },
  "科学": {
    positive: "clean infographic illustration, isometric or cutaway view, friendly bright palette",
    negative: "no text labels, no logo, no scary scene, child-friendly",
  },
  "科普": {  // zh science
    positive: "friendly cartoon educational illustration, bright soft color, science-themed scene, kid-friendly characters",
    negative: "no text, no logo, child-friendly",
  },
  "自然": {
    positive: "naturalist field-guide illustration, scientifically accurate, lush environment, soft watercolor",
    negative: "no text, no logo, no hunting, child-friendly",
  },
  "时事": {
    positive: "editorial magazine illustration, modern flat with grain texture, soft journalism palette, conceptual",
    negative: "no text, no logo, no political symbol, no violence, child-friendly",
  },
  "文化": {
    positive: "festive folk-art illustration, culture-specific motifs, vibrant celebratory palette",
    negative: "no text, no logo, child-friendly",
  },
  "现代文": {
    positive: "contemporary children's picture-book style, soft pastels, kid-friendly characters, daily-life setting",
    negative: "no text, no logo, child-friendly",
  },
};

export function buildCoverPrompt(category: string, scene: string): {
  positive: string;
  negative: string;
} {
  const preset = COVER_STYLES[category] || COVER_STYLES["现代文"];
  return {
    positive: `${preset.positive}, scene: ${scene}`,
    negative: preset.negative,
  };
}
```

Total: 10 presets covering all en+zh categories (some shared semantically: 科学/科普).

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| pinyin-pro multi-tone errors | Add unit tests with 行/长/重/银行/重要; fallback to dictionary-cccedict for known-hard words |
| Pollinations returns child-unsafe images | Negative prompt enforces `child-friendly, no violence`; sample QA in Wave 5 |
| MiniMax rate limits | Quota table + atomic RPC + Pollinations fallback |
| Storage cost | 60KB/image, ~50 articles/day = 3MB/day = 90MB/month; negligible |
| Topic migration loses entries | W1-T1 dry-run prints count, asserts ≥ 100; verify script compares old vs new |
| Historical/cultural fact errors | Quality gate checks classical-quote-in-content; sample QA reviews 10 zh historical articles |

---

## 8. Rollback

Per-Wave rollback:
- Wave 1: `supabase migration revert 035 036 037`; `git restore` modified TS files
- Wave 2: `git restore src/lib/reading/{quality-gate,difficulty,cover-generator,illustration-generator}.ts`
- Wave 3: `git restore scripts/*.mjs src/app/api/reading/refresh-news/route.ts`
- Wave 4: `git restore src/components/reading/*.tsx`

Full rollback: branch revert. All migrations are additive (new tables, new columns); no destructive change to existing rows.

---

## 9. Estimation

- Wave 1: 30-45 min (4 parallel agents)
- Wave 2: 45-60 min (4 parallel)
- Wave 3: 30-45 min (3 parallel)
- Wave 4: 20-30 min (2 parallel)
- Wave 5: 30 min sequential
- Total: ~3-4 hours optimistic, 6-8 hours with retries
