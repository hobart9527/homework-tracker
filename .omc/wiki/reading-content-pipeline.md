# Reading Content Generation Pipeline

> Last updated: 2026-05-11 | Source: `scripts/`, `src/lib/reading/`

---

## 1. Overview

Two entry scripts share the same library modules:

| Script | Language | File |
|--------|----------|------|
| English pipeline | `en` | `scripts/reading-content-pipeline.ts` (line 1) |
| Chinese pipeline | `zh` | `scripts/seed-chinese-reading-content.ts` (line 1) |

**Six phases:**

```
[Phase 1] Topic Loading
    ↓
[Phase 2] Duplicate Detection ──→ SKIP existing published
    ↓
[Phase 3] Content Generation (LLM) ← Pacer(3) + withRetry
    ↓
[Phase 4] Quality Gate ──→ errors → draft; warnings → published
    ↓
[Phase 5] Media Enrichment
    ├─ 5a Pinyin (zh only)
    ├─ 5b Cover image (MiniMax → Pollinations fallback)
    └─ 5c Paragraph illustrations (Pollinations)
    ↓
[Phase 6] Database Persistence (upsert)
```

---

## 2. Phase-by-Phase Documentation

### Phase 1: Topic Loading

**English**: `scripts/reading-content-pipeline.ts:325-346`

```typescript
async function loadTopics(supabase, limit): Promise<ReadingTopicRow[]>
```

- Query: `reading_topics` WHERE `language='en'` AND `status='active'`
- Optional `PIPELINE_TOPIC_LIMIT` env var caps result
- Falls back to `PIPELINE_GRADES` env var (default `"3,6"`)

**Chinese**: `scripts/seed-chinese-reading-content.ts:57-71`

- Query: `reading_topics` WHERE `language='zh'` AND `status='active'`
- `TOPIC_LIMIT` env var limits count
- Default grades: `[3, 5]` if `target_grades` is null/empty

**Output**: `ReadingTopicRow[]` with fields `topic_key`, `category`, `source_text`, `source_url`, `target_grades`

---

### Phase 2: Duplicate Detection

**English**: `scripts/reading-content-pipeline.ts:467-477`

```typescript
await checkExistingArticle(supabase, topic.topic_key, grade)
// Returns: { exists: boolean, id: string | null, status: string | null }
// Skip if exists && status === 'published'
```

**Chinese**: `scripts/seed-chinese-reading-content.ts:104-121`

- Per task: query `reading_articles` by `topic_key` + `language='zh'`
- Skip if row exists

**Decision gate**: If article is `published`, skip generation entirely.

---

### Phase 3: Content Generation (LLM)

**Entry point**: `src/lib/reading/content-generator.ts:352-407`

```typescript
export async function generateReadingContent(opts: GenerateReadingOptions)
```

**Concurrency control**: `src/lib/reading/concurrency.ts:22-53`

```typescript
class Pacer {
  constructor(private readonly concurrency: number = 3) {}
  async run<T>(fn: () => Promise<T>): Promise<T>
}
```

- Pacer instantiated with fixed concurrency=3 (`reading-content-pipeline.ts:401`, `seed-chinese-reading-content.ts:49`)
- **NOT configurable via env var**

**Retry wrapper**: `src/lib/reading/concurrency.ts:83-116`

```typescript
export async function withRetry<T>(fn, options?: RetryOptions)
```

- Default: `maxRetries=2`, `baseDelayMs=1000`, `maxDelayMs=10000`
- `shouldRetry` default: HTTP 429 or 500+ (see `defaultShouldRetry` at line 121)
- **No 429-specific backoff** — exponential backoff starts from attempt 2 regardless of error type

**Prompt selection**: `content-generator.ts:359`

```typescript
const prompt = opts.language === "zh"
  ? buildChinesePrompt(opts)   // line 175
  : buildEnglishPrompt(opts);  // line 118
```

**Behavior A — effective grade derivation** (`content-generator.ts:71-82`):

```typescript
function deriveEffectiveGrade(options): number
// Parses RAZ level codes ['L5','L6'] → takes MAX → effectiveGrade=6
// Falls back to explicit gradeLevel when array empty or no parseable codes
```

- `effectiveGrade` used only in prompt builders for word limits and question counts
- `gradeLevel` remains the primary signal for quality gate checks

**JSON parsing** (`content-generator.ts:376-382`):

```typescript
const text = rawText
  .replace(/<think[\s\S]*?<\/think>/gi, "")  // strip MiniMax reasoning blocks
  .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")  // strip markdown fences
  .trim() || "{}";
const result = JSON.parse(text);  // ← THROWS on malformed JSON
```

**Output contract**:

```typescript
{
  article: GeneratedArticle & {
    scene_description: string;
    classical_quote?: { original, pinyin, translation }; // zh only
  };
  questions: GeneratedQuestion[];
  illustrations: GeneratedIllustration[];  // [{ paragraph_index, scene_description }]
}
```

---

### Phase 4: Quality Gate

**Entry point**: `src/lib/reading/quality-gate.ts:265-281`

```typescript
export function validateContent(input: QualityGateInput): QualityGateResult

interface QualityGateInput {
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  language: "zh" | "en";
  gradeLevel: number;  // ← uses gradeLevel, NOT effectiveGrade
}
```

**Decision rule** (`quality-gate.ts:275`):

```typescript
const pass = !issues.some((i) => i.severity === "error");
// errors → draft; warnings only → published
```

**Checks performed**:

| Check | File:Line | Error Severity |
|-------|----------|----------------|
| Word count range | `quality-gate.ts:101-121` | warn if deviation 20-50%, error if >50% |
| Question options (4 required, correct in options, unique) | `quality-gate.ts:123-153` | error |
| Question type distribution skew | `quality-gate.ts:155-179` | warn |
| Difficulty vs word count mismatch | `quality-gate.ts:181-207` | info |
| Pinyin round-trip (zh only) | `quality-gate.ts:209-235` | error |
| Classical quote present in content (zh only) | `quality-gate.ts:237-259` | warn |

**Word count ranges** (`quality-gate.ts:50-63`):

| Language | Grade | Range |
|----------|-------|-------|
| en | G1-4 | 300-450 words |
| en | G5+ | 500-800 words |
| zh | G1-3 | 150-220 chars |
| zh | G4 | 180-280 chars |
| zh | G5 | 220-350 chars |
| zh | G6 | 280-420 chars |
| zh | G7+ | 350-500 chars |

**Note**: `calculateObjectiveDifficulty()` in `src/lib/reading/difficulty.ts:258` is **NOT wired into the pipeline**. It exists and is exported from the barrel (`index.ts:51-57`) but no script calls it.

---

### Phase 5: Media Enrichment

#### Phase 5a: Pinyin Conversion (zh only)

**Entry point**: `src/lib/reading/pinyin-converter.ts:19-51`

```typescript
export function convertToRubyPinyin(text: string): string
// Output: "我爱中国" → "我(wǒ)爱(ài)中国(zhōng guó)"
```

- Uses `pinyin-pro` package with word-aware segmentation
- Non-Chinese segments pass through unchanged
- Called in `seed-chinese-reading-content.ts:149` after generation

#### Phase 5b: Cover Image Generation

**Entry point**: `src/lib/reading/cover-generator.ts:271-302`

```typescript
export async function generateCover(opts: GenerateCoverOptions): Promise<CoverResult>
```

**Strategy** (`cover-generator.ts:160-175`):

1. Call `increment_minimax_quota` RPC (consumes slot if true)
2. If quota available → call MiniMax `image-01`
3. If MiniMax fails → fall back to Pollinations
4. Both fail → throw `cover generation failed: <reason>`

**Quotas** (`cover-generator.ts:153-158`):
- Default daily quota: 50 (via `MINIMAX_DAILY_QUOTA` env var)
- RPC failure treated as "quota unavailable" → Pollinations fallback

**Pollinations retry** (`cover-generator.ts:102-130`):
- Max attempts: 4
- Base delay: 500ms (via `COVER_RETRY_BASE_DELAY_MS` env var)
- Max delay: 8000ms
- Jitter ratio: 0.5

**English pipeline** (`reading-content-pipeline.ts:505-521`): cover wrapped in `pacer.run()` + `withRetry()`
**Chinese pipeline** (`seed-chinese-reading-content.ts:162-176`): cover NOT wrapped in pacer; non-blocking failure only

#### Phase 5c: Paragraph Illustrations

**Entry point**: `src/lib/reading/illustration-generator.ts:139-187`

```typescript
export async function generateIllustrations(opts: GenerateIllustrationsOptions): Promise<IllustrationResult>
// Returns: [{ paragraph_index, url, source_url, source: "pollinations", bytes }]
```

- Pollinations only (no MiniMax quota consumption)
- Sequential processing (NOT parallel) — each scene waits for previous to complete
- Non-blocking failures: warnings logged, continues to next scene
- Retry: max 4 attempts, same backoff as cover-generator

**English pipeline** (`reading-content-pipeline.ts:524-542`): illustrations wrapped in `pacer.run()` + `withRetry()`
**Chinese pipeline** (`seed-chinese-reading-content.ts:318-366`): illustrations wrapped in `pacer.run()` at line 324

#### Phase 5d: TTS Audio (NOT wired)

**File**: `src/lib/reading/tts-azure-client.ts:151-205`

```typescript
export async function synthesizeChinese(opts: TtsSynthesizeOptions): Promise<TtsSynthesizeResult>
// Requires AZURE_SPEECH_KEY env var
// Returns: { audioBytes: Uint8Array, mimeType: "audio/mpeg", voice, durationSecondsEstimate }
```

- Stub exists but is **NOT called** by either pipeline script
- `isTtsConfigured()` at line 131 checks for key presence
- `MissingTtsKeyError` thrown when key absent (line 156)

---

### Phase 6: Database Persistence

**English pipeline**: `reading-content-pipeline.ts:544-580`

```typescript
await upsertArticle(supabase, articleData)           // line 545
await replaceQuestions(supabase, articleId, ...)     // line 565
await replaceIllustrations(supabase, articleId, ...) // line 568
```

**Chinese pipeline**: `seed-chinese-reading-content.ts:221-376`

```typescript
supabase.from("reading_articles").insert(...)       // line 222
supabase.from("reading_questions").insert(...)      // line 308
supabase.from("reading_article_illustrations").insert(...) // line 355
```

**Upsert behavior** (English only): `onConflict: "topic_key, grade_level"` (`reading-content-pipeline.ts:219`)

**Cover re-upload** (Chinese only, `seed-chinese-reading-content.ts:255-285`):
- Article inserted first with temporary cover URL
- After getting `articleRow.id`, re-uploads via Pollinations CDN
- Updates `cover_image_url` and `cover_source_url` in DB

---

## 3. Grade Matching

**Mismatch issue**: `effectiveGrade` vs `gradeLevel`

- `effectiveGrade` = `deriveEffectiveGrade()` result (line 71-82)
  - Uses RAZ level codes if provided, takes MAX
  - Drives word limits and question counts in LLM prompts
- `gradeLevel` = explicit parameter passed to `generateReadingContent()`
  - Used by quality gate word count checks
- **Inconsistency**: If `recommendedLevels=['L5','L6']`, prompts use G6 limits but quality gate checks G3 ranges → potential false failures

**Word count ranges by grade** (quality-gate.ts:50-63):

English: G1-4 → 300-450 words; G5+ → 500-800 words
Chinese: G1-3 → 150-220 chars; G4 → 180-280; G5 → 220-350; G6 → 280-420; G7+ → 350-500

---

## 4. Bottlenecks and Failure Points

| Issue | Location | Impact |
|-------|----------|--------|
| Pacer fixed at 3 | `concurrency.ts:26` | No throughput tuning without code change |
| LLM retry: no 429-aware backoff | `concurrency.ts:121-130` | Retries on 429 same as 500 — no backoff delay difference |
| Illustrations sequential | `illustration-generator.ts:149-183` | Scenes processed one at a time despite pacer wrapping in callers |
| TTS audio not wired | `tts-azure-client.ts` | Implemented but never called |
| JSON parsing: no recovery | `content-generator.ts:382` | `JSON.parse(text)` throws on malformed response — no fallback |
| `calculateObjectiveDifficulty` not called | `difficulty.ts:258` | Available but unused by pipeline |
| English: no re-upload path for cover | `reading-content-pipeline.ts` | Cover URL may be Pollinations CDN, not internal Storage |

---

## 5. Content Richness Map

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| Cover image | Implemented | `cover-generator.ts` | MiniMax primary, Pollinations fallback |
| Paragraph illustrations | Implemented | `illustration-generator.ts` | Pollinations only; sequential |
| Pinyin (zh) | Implemented | `pinyin-converter.ts` | Ruby format via pinyin-pro |
| Audio TTS (zh) | Stub only | `tts-azure-client.ts` | NOT wired into pipeline |
| Audio TTS (en) | Not implemented | — | No TTS module for English |

---

## 6. Optimization Opportunities

### P0 (Critical)

1. **JSON parsing resilience** (`content-generator.ts:382`)
   - `JSON.parse(text)` throws on malformed LLM output
   - Add try/catch with fallback: strip remaining `<think>` blocks, attempt fix, or return partial result
   - Affects: all generations

### P1 (High)

2. **Rate limit 429-aware retry** (`concurrency.ts:121-130`)
   - Current: all errors treated equally in `shouldRetry`
   - Need: longer initial delay on 429 specifically (e.g., `Retry-After` header or 30s backoff)
   - Affects: content generation, cover, illustrations

### P2 (Medium)

3. **Grade matching accuracy** (`content-generator.ts:71-82`, `quality-gate.ts`)
   - `effectiveGrade` derived from `recommendedLevels` drives prompts; `gradeLevel` drives validation
   - When recommendedLevels has higher upper bound than gradeLevel → quality gate may flag false errors
   - Fix: quality gate should accept effectiveGrade or add tolerance for RAZ-derived articles

### P3 (Low)

4. **TTS audio wiring** (`tts-azure-client.ts`)
   - Implement Azure TTS call after article insert in both pipelines
   - Store `audio_url` in `reading_articles` table

5. **Illustration parallelization** (`illustration-generator.ts:149`)
   - Sequential `for` loop prevents parallelism even when pacer is available
   - Consider `Promise.all()` with error isolation per scene

6. **Cover re-upload for English** (`reading-content-pipeline.ts`)
   - Chinese pipeline re-uploads Pollinations CDN URLs to internal Storage
   - English pipeline does not — could cause broken URLs if Pollinations changes

---

## 7. File Index

| File | Lines | Purpose |
|------|-------|---------|
| `scripts/reading-content-pipeline.ts` | 1-605 | English entry point |
| `scripts/seed-chinese-reading-content.ts` | 1-387 | Chinese entry point |
| `src/lib/reading/content-generator.ts` | 1-407 | LLM generation + prompts |
| `src/lib/reading/quality-gate.ts` | 1-282 | Post-generation validation |
| `src/lib/reading/concurrency.ts` | 1-157 | Pacer + withRetry |
| `src/lib/reading/cover-generator.ts` | 1-303 | Cover image generation |
| `src/lib/reading/illustration-generator.ts` | 1-188 | Paragraph illustrations |
| `src/lib/reading/pinyin-converter.ts` | 1-52 | Chinese ruby pinyin |
| `src/lib/reading/tts-azure-client.ts` | 1-206 | Azure TTS (not wired) |
| `src/lib/reading/difficulty.ts` | 1-311 | Objective difficulty (not wired) |
| `src/lib/reading/index.ts` | 1-87 | Barrel export |