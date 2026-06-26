# Reading Quality Refresh & Level Progression — Implementation Plan

> **OMC execution note:** This is planning material. Before execution, compile this plan through the OMC Plan Adapter into file ownership, dependency graph, waves, and scoped `adhd-agent` task packets. Do not use native `subagent-driven-development` or `executing-plans` unless the user explicitly opts into native Superpowers execution.

**Goal:** Restructure reading content to per-grade caps (40 articles/grade G3-G10), deepen chapterized generation with IB academic alignment, add automatic level-up from quiz performance, and implement soft-archive refresh pipeline.

**Architecture:** Config-driven standards in `config/reading-standards.json` (extended with L4 + academic textTypeDistribution), per-grade cap enforcement in pipeline, level-up triggered from quiz submit API, soft-archive via `status=archived`.

**Tech Stack:** TypeScript, Supabase, MiniMax M2.7 LLM, Next.js API routes.

**OMC integration note:** The structural decompositions below (ownership map, dependency graph, wave plan, verification, rollback) are produced by OMC Plan Adapter during Compilation Phase. This plan provides task-level content; OMC Plan Adapter extracts and structures it into executable packets.

**Verification:** See each task.

**Rollback:** See each task.

---

## File Structure

```
config/
  reading-standards.json          MODIFY: add L4 level, adjust textTypeDistribution
  reading-level-progression.json  CREATE: level-up thresholds

src/lib/reading/
  standards.ts                    MODIFY: minor (no change needed — G1-10 standards already exist)
  content-generator.ts            MODIFY: G3 chapter support, depth anchors in prompts
  quality-gate.ts                 MODIFY: add coherence check across chapters
  types.ts                        MODIFY: add 'archived' to ReadingArticleStatus
  progression.ts                  CREATE: level-up check logic

src/app/api/reading/
  quiz/submit/route.ts            MODIFY: trigger progression check after quiz save
  articles/route.ts or similar    MODIFY: filter status=published

scripts/
  reading-content-pipeline.ts     MODIFY: per-grade cap, archive overshoot, fill deficit
```

---

### Task 1: Update standards config with L4 + academic text types

**Files:**
- Modify: `config/reading-standards.json`

- [ ] **Step 1: Add L4 level entry**

Insert after L3 block:

```json
    "L4": {
      "label": "MYP phase 5 / DP prep",
      "gradeRange": [10],
      "razLevels": ["Z1", "Z2"],
      "lexileBand": { "min": 1200, "max": 1400 },
      "wordCount": { "min": 1500, "max": 3000 },
      "syntax": { "simple": 5, "compound": 35, "complex": 60 },
      "blooms": { "literal": 0, "infer": 1, "evaluate": 3, "synthesize": 3 },
      "vocabulary": "GSL full + AWL full + academic vocabulary. Use domain-specific terminology, nuanced arguments, rhetorical devices, and evidence-based reasoning."
    }
```

- [ ] **Step 2: Adjust textTypeDistribution**

Replace the existing object with:

```json
  "textTypeDistribution": {
    "L1": { "fiction": 40, "non-fiction": 40, "poetry": 10, "drama": 5, "media": 5, "academic": 0 },
    "L2": { "fiction": 25, "non-fiction": 30, "poetry": 10, "drama": 10, "media": 10, "academic": 15 },
    "L3": { "fiction": 20, "non-fiction": 25, "poetry": 10, "drama": 10, "media": 15, "academic": 20 },
    "L4": { "fiction": 10, "non-fiction": 20, "poetry": 5, "drama": 5, "media": 20, "academic": 40 }
  }
```

Note: L2 academic 15% applies to G5-G7. Content-generator or pipeline should use G5=5%, G6+=15% by checking actual grade number vs level range.

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('config/reading-standards.json','utf8'))" && echo "valid"`

Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add config/reading-standards.json
git commit -m "feat: add L4 level and adjust text type distribution for academic from G6"
```

**Rollback:** `git revert HEAD`

---

### Task 2: Create level-progression config

**Files:**
- Create: `config/reading-level-progression.json`

- [ ] **Step 1: Write config file**

```json
{
  "version": 1,
  "minArticlesRead": 15,
  "minAccuracyPct": 75,
  "gradeSequence": [3, 4, 5, 6, 7, 8, 9, 10],
  "allowGradeSkip": false
}
```

- [ ] **Step 2: Verify**

Run: `node -e "JSON.parse(require('fs').readFileSync('config/reading-level-progression.json','utf8'))" && echo "valid"`

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add config/reading-level-progression.json
git commit -m "feat: add reading level progression config (15 articles, 75% accuracy)"
```

**Rollback:** `git revert HEAD`

---

### Task 3: Add `archived` status to types

**Files:**
- Modify: `src/lib/reading/types.ts`
- Modify: `src/app/[locale]/(parent)/settings/reading/page.tsx` (if it queries articles by status)

- [ ] **Step 1: Update type**

In `src/lib/reading/types.ts` line 12, change:
```typescript
export type ReadingArticleStatus = "draft" | "published";
```
to:
```typescript
export type ReadingArticleStatus = "draft" | "published" | "archived";
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: clean exit, no type errors related to ReadingArticleStatus

- [ ] **Step 3: Commit**

```bash
git add src/lib/reading/types.ts
git commit -m "feat: add archived status to ReadingArticleStatus type"
```

**Rollback:** `git revert HEAD`

---

### Task 4: G3 chapter support in content-generator

**Files:**
- Modify: `src/lib/reading/content-generator.ts`

**Background:** Currently `gradeHasChapters()` returns true when `chapterCount > 1`. G3 has `chapterCount: 1` in standards, so it generates as a single block. We need G3 to also use chapters (2-3 short chapters) for consistent depth.

- [ ] **Step 1: Change `gradeHasChapters` threshold**

We don't change standards.ts. Instead, in `generateReadingContent()` in content-generator.ts, change the chapterization condition so G3 also uses chapters.

Find this code (around line 1188):
```typescript
  if (opts.route !== "A" && gradeHasChapters(effectiveGradeForDifficulty, lang)) {
    return generateChapterizedContent(opts, effectiveGradeForDifficulty, lang);
  }
```

Change to:
```typescript
  // G3+ uses chapterized generation for better depth and token management
  // G3 gets 2 chapters, G4+ uses standards-defined chapter count
  const effectiveChapterCount = effectiveGradeForDifficulty <= 3 ? 2 : gradeHasChapters(effectiveGradeForDifficulty, lang);
  if (opts.route !== "A" && (effectiveChapterCount || effectiveGradeForDifficulty <= 3)) {
    // For G3, force chapterCount in generateChapterizedContent
    if (effectiveGradeForDifficulty <= 3) {
      return generateChapterizedContent(opts, effectiveGradeForDifficulty, lang, 2);
    }
    return generateChapterizedContent(opts, effectiveGradeForDifficulty, lang);
  }
```

- [ ] **Step 2: Update `generateChapterizedContent` signature**

Find `generateChapterizedContent` function (line ~1122) and add optional `forceChapterCount` param:

```typescript
async function generateChapterizedContent(
  opts: GenerateReadingOptions,
  grade: number,
  lang: "en" | "zh",
  forceChapterCount?: number
): Promise<{
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  illustrations: LocalGeneratedIllustration[];
}> {
  const chapterCount = forceChapterCount || getChapterCount(grade, lang);
  // ... rest unchanged
```

- [ ] **Step 3: Update outline prompt for G3**

In `generateChapterOutline()` function, the prompt already uses `chapterCount` variable from line above. No change needed — it will now receive 2 for G3.

- [ ] **Step 4: Test compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: clean exit

- [ ] **Step 5: Commit**

```bash
git add src/lib/reading/content-generator.ts
git commit -m "feat: G3 chapterized generation (2 chapters) for better depth"
```

**Rollback:** `git revert HEAD`

---

### Task 5: Chapter prompt depth anchors

**Files:**
- Modify: `src/lib/reading/content-generator.ts`

**Background:** Current chapter prompts just say "write chapter X of Y for grade Z". No depth anchors, no IB targets, no vocabulary tier enforcement.

- [ ] **Step 1: Enhance English chapter prompt with depth anchors**

In `buildChapterPromptEn()` function (around line 913), after the "Grade X specifications" block, add:

```typescript
// --- DEPTH ANCHORS (IB-aligned) ---
const depthAnchor = grade >= 6
  ? `\nACADEMIC DEPTH REQUIREMENTS (Grade ${grade}):
- Include ONE direct or paraphrased reference to a real source/expert/citation
- Use at least 3 AWL (Academic Word List) tier-2 words appropriate for Grade ${grade}
- Present at least ONE viewpoint and, where applicable, a contrasting perspective
- Each paragraph must advance a specific idea — no filler sentences`
  : grade >= 4
  ? `\nREASONING DEPTH REQUIREMENTS (Grade ${grade}):
- Include ONE inference opportunity where the reader must connect two facts
- Use at least 2 vocabulary words from the Grade ${grade} scope
- Each paragraph should build on the previous one`
  : `\nCOMPREHENSION DEPTH (Grade 3):
- Use simple cause-effect connections between sentences
- Include ONE "why do you think" moment for the reader`;
```

Then inject `depthAnchor` into the prompt string where appropriate (before the OUTPUT FORMAT section).

- [ ] **Step 2: Add transition check to chapter prompt**

In the same function, after OUTPUT FORMAT section, add:

```typescript
const transitionCheck = chapter.index > 0
  ? `\nTRANSITION CHECK: This is chapter ${chapter.index + 1} of ${chapterCount}.
- DO NOT repeat facts, setting, or background already covered in chapter ${chapter.index}
- DO NOT jump ahead to events belonging in chapter ${chapter.index + 2}
- Start with a natural transition from where chapter ${chapter.index} ended
- If chapter ${chapter.index} had a question unanswered, address it here`
  : `\nTRANSITION CHECK: This is the FIRST chapter.
- Set the scene, introduce the topic
- Do NOT resolve the main question — leave it for later chapters`;
```

- [ ] **Step 3: Repeat for Chinese chapter prompt**

In `buildChapterPromptZh()` function (around line 994), mirror the same depth anchor and transition check in Chinese.

- [ ] **Step 4: Compile check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: clean exit

- [ ] **Step 5: Commit**

```bash
git add src/lib/reading/content-generator.ts
git commit -m "feat: add depth anchors and transition checks to chapter prompts"
```

**Rollback:** `git revert HEAD`

---

### Task 6: Cross-chapter coherence check

**Files:**
- Create: `src/lib/reading/coherence-check.ts`
- Modify: `scripts/reading-content-pipeline.ts` (wire it in)

- [ ] **Step 1: Create coherence check module**

```typescript
/**
 * Cross-chapter coherence check for reading articles.
 * Runs after chapter generation to catch contradictions, vocabulary drift,
 * and structural issues.
 */

import type { ArticleChapter } from "./types";

export interface CoherenceIssue {
  code: string;
  severity: "warn" | "error";
  message: string;
  chapterIndex?: number;
}

export interface CoherenceCheckResult {
  pass: boolean;
  issues: CoherenceIssue[];
}

export function checkChapterCoherence(chapters: ArticleChapter[], grade: number, language: "en" | "zh"): CoherenceCheckResult {
  const issues: CoherenceIssue[] = [];

  if (chapters.length < 2) {
    return { pass: true, issues: [] };
  }

  // Check 1: No chapter with zero content
  chapters.forEach((ch, i) => {
    if (!ch.content || ch.content.trim().length < 50) {
      issues.push({
        code: "chapter-empty",
        severity: "error",
        message: `Chapter ${i + 1} has insufficient content (${ch.content?.length || 0} chars)`,
        chapterIndex: i,
      });
    }
  });

  // Check 2: No chapter with zero questions (chapters store questions separately, so this
  // is a placeholder — the actual questions-per-chapter check happens in quality-gate.ts)
  // For coherence, check word_count consistency
  chapters.forEach((ch, i) => {
    if (ch.word_count > 0 && ch.word_count < 50) {
      issues.push({
        code: "chapter-too-short",
        severity: "warn",
        message: `Chapter ${i + 1} has only ${ch.word_count} words`,
        chapterIndex: i,
      });
    }
  });

  // Check 3: Vocabulary level consistency — scan for words that seem
  // too simple or too complex for the target grade (basic heuristic)
  // Full vocabulary check is done by quality-gate.ts; this is a quick guard
  if (language === "en" && grade >= 6) {
    const allContent = chapters.map(c => c.content).join(" ");
    const basicWords = ["good", "nice", "bad", "big", "small", "happy", "sad"];
    const basicCount = basicWords.reduce((sum, w) => {
      const re = new RegExp(`\\b${w}\\b`, "gi");
      return sum + ((allContent.match(re) || []).length);
    }, 0);
    const wordEstimate = allContent.split(/\s+/).length;
    if (wordEstimate > 0 && basicCount / wordEstimate > 0.05) {
      issues.push({
        code: "vocab-too-basic",
        severity: "warn",
        message: `Over 5% of words are basic vocabulary (${basicCount}/${wordEstimate}) for grade ${grade}`,
      });
    }
  }

  // Check 4: Fact contradiction across chapters (simple heuristic:
  // if same named entity appears very differently, flag)
  // Future enhancement: could use LLM call; for now just structural checks

  // Pass if no error-level issues
  const pass = !issues.some(i => i.severity === "error");
  return { pass, issues };
}
```

- [ ] **Step 2: Wire into pipeline**

In `scripts/reading-content-pipeline.ts`, import and run coherence check after content generation:

```typescript
import { checkChapterCoherence } from "@/lib/reading/coherence-check";

// After Step 4 quality gates, add:
if (article.chapters && article.chapters.length > 1) {
  const coherenceResult = checkChapterCoherence(article.chapters, grade, pipelineLanguage);
  allIssues.push(
    ...coherenceResult.issues.map(i => ({ ...i, source: "coherence" as const }))
  );
  if (!coherenceResult.pass) {
    // coherence error is blocking
    effectiveFactualPass = false; // or handle separately
  }
}
```

- [ ] **Step 3: Test**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: clean exit

- [ ] **Step 4: Commit**

```bash
git add src/lib/reading/coherence-check.ts scripts/reading-content-pipeline.ts
git commit -m "feat: add cross-chapter coherence check"
```

**Rollback:** `git revert HEAD`, remove import in pipeline

---

### Task 7: Pipeline per-grade cap and archive logic

**Files:**
- Modify: `scripts/reading-content-pipeline.ts`

**Background:** Currently pipeline iterates all topics × grades and generates. New behavior: check per-grade count first, only generate for deficit grades, archive surplus.

- [ ] **Step 1: Add per-grade counting at start of main()**

After `const supabase = await getSupabaseClient();` and grade validation, add:

```typescript
const TARGET_PER_GRADE = 40;

async function getGradeCounts(supabase: SupabaseClient, language: string): Promise<Record<number, number>> {
  const { data } = await supabase
    .from("reading_articles")
    .select("grade_level")
    .eq("language", language)
    .eq("status", "published");
  const counts: Record<number, number> = {};
  for (const a of data || []) {
    counts[a.grade_level] = (counts[a.grade_level] || 0) + 1;
  }
  // Fill in missing grades with 0
  for (let g = 3; g <= 10; g++) {
    if (counts[g] === undefined) counts[g] = 0;
  }
  return counts;
}
```

- [ ] **Step 2: Print distribution and skip grades at cap**

```typescript
const gradeCounts = await getGradeCounts(supabase, pipelineLanguage);
console.log("=== CURRENT DISTRIBUTION ===");
for (let g = 3; g <= 10; g++) {
  const count = gradeCounts[g] || 0;
  const status = count >= TARGET_PER_GRADE ? "CAP" : `${count}/${TARGET_PER_GRADE}`;
  console.log(`  G${g}: ${status}`);
}
```

Then in the work item loop, skip when grade already at cap:

```typescript
// In work item generation:
if ((gradeCounts[grade] || 0) >= TARGET_PER_GRADE) {
  console.log(`SKIP (G${grade} at cap ${TARGET_PER_GRADE})`);
  return { status: "skipped" };
}
```

- [ ] **Step 3: Add archive step after generation phase**

After the main generation loop, add archive logic:

```typescript
async function archiveSurplus(supabase: SupabaseClient, language: string, targetPerGrade: number): Promise<void> {
  for (let grade = 3; grade <= 10; grade++) {
    const { data: articles } = await supabase
      .from("reading_articles")
      .select("id, created_at")
      .eq("language", language)
      .eq("status", "published")
      .eq("grade_level", grade)
      .order("created_at", { ascending: true });

    if (!articles || articles.length <= targetPerGrade) continue;

    const toArchive = articles.slice(0, articles.length - targetPerGrade);
    if (toArchive.length === 0) continue;

    const ids = toArchive.map(a => a.id);
    console.log(`  G${grade}: archiving ${ids.length} oldest articles`);

    const { error } = await supabase
      .from("reading_articles")
      .update({ status: "archived" })
      .in("id", ids);

    if (error) console.error(`  Archive error G${grade}: ${error.message}`);
  }
}
```

Call after generation loop:
```typescript
await archiveSurplus(supabase, pipelineLanguage, TARGET_PER_GRADE);
```

- [ ] **Step 4: Monthly 20% rotation**

Extend archive step: also archive the oldest 20% of remaining articles per grade (after cap enforcement):

```typescript
async function rotateStale(supabase: SupabaseClient, language: string): Promise<void> {
  for (let grade = 3; grade <= 10; grade++) {
    const { data: articles } = await supabase
      .from("reading_articles")
      .select("id, created_at")
      .eq("language", language)
      .eq("status", "published")
      .eq("grade_level", grade)
      .order("created_at", { ascending: true });

    if (!articles || articles.length < 5) continue; // don't rotate if too few

    const rotateCount = Math.max(1, Math.floor(articles.length * 0.2));
    const toRotate = articles.slice(0, rotateCount);
    const ids = toRotate.map(a => a.id);

    console.log(`  G${grade}: rotating ${ids.length} stale articles`);
    await supabase.from("reading_articles").update({ status: "archived" }).in("id", ids);
  }
}
```

Call after archiveSurplus.

- [ ] **Step 5: Commit**

```bash
git add scripts/reading-content-pipeline.ts
git commit -m "feat: per-grade cap (40/article), archive surplus, monthly rotation"
```

**Rollback:** `git revert HEAD`

---

### Task 8: Level-up progression module

**Files:**
- Create: `src/lib/reading/progression.ts`

- [ ] **Step 1: Create progression module**

```typescript
/**
 * Reading level progression logic.
 * Checks if a child qualifies for grade level-up based on:
 *   - minArticlesRead threshold at current grade
 *   - minAccuracyPct average across attempts at current grade
 *
 * Config: config/reading-level-progression.json
 */

import progressionConfig from "../../../config/reading-level-progression.json";
import { createServiceRoleClient } from "@/lib/supabase/server";

const config = progressionConfig as {
  version: number;
  minArticlesRead: number;
  minAccuracyPct: number;
  gradeSequence: number[];
  allowGradeSkip: boolean;
};

export interface ProgressionCheckResult {
  leveledUp: boolean;
  currentGrade: number;
  newGrade: number | null;
  articlesRead: number;
  averageAccuracy: number;
}

/**
 * Check if a child qualifies to advance to the next reading grade.
 * Called after each quiz submission.
 */
export async function checkLevelProgression(
  childId: string
): Promise<ProgressionCheckResult> {
  const supabase = await createServiceRoleClient();

  // 1. Get child's current reading grade
  const { data: child } = await supabase
    .from("children")
    .select("id, reading_grade_level, grade_level")
    .eq("id", childId)
    .single();

  if (!child) {
    throw new Error(`Child not found: ${childId}`);
  }

  const currentReadingGrade = child.reading_grade_level || child.grade_level;

  // 2. Count completed assignments at current grade
  const { data: articles } = await supabase
    .from("reading_articles")
    .select("id")
    .eq("grade_level", currentReadingGrade)
    .eq("language", "en")
    .in("status", ["published", "archived"]); // include archived for history

  const articleIds = articles?.map(a => a.id) || [];
  if (articleIds.length === 0) {
    return {
      leveledUp: false,
      currentGrade: currentReadingGrade,
      newGrade: null,
      articlesRead: 0,
      averageAccuracy: 0,
    };
  }

  // 3. Count quiz attempts for those articles
  const { data: attempts } = await supabase
    .from("reading_quiz_attempts")
    .select("score, total_questions")
    .eq("child_id", childId)
    .in("article_id", articleIds);

  if (!attempts || attempts.length < config.minArticlesRead) {
    return {
      leveledUp: false,
      currentGrade: currentReadingGrade,
      newGrade: null,
      articlesRead: attempts?.length || 0,
      averageAccuracy: attempts && attempts.length > 0
        ? Math.round(attempts.reduce((s, a) => s + (a.score / a.total_questions) * 100, 0) / attempts.length)
        : 0,
    };
  }

  // 4. Calculate average accuracy
  const totalQuestions = attempts.reduce((s, a) => s + a.total_questions, 0);
  const totalCorrect = attempts.reduce((s, a) => s + a.score, 0);
  const averageAccuracy = Math.round((totalCorrect / totalQuestions) * 100);

  if (averageAccuracy < config.minAccuracyPct) {
    return {
      leveledUp: false,
      currentGrade: currentReadingGrade,
      newGrade: null,
      articlesRead: attempts.length,
      averageAccuracy,
    };
  }

  // 5. Level up!
  const currentIndex = config.gradeSequence.indexOf(currentReadingGrade);
  if (currentIndex === -1 || currentIndex >= config.gradeSequence.length - 1) {
    // Already at max grade or grade not in sequence
    return {
      leveledUp: false,
      currentGrade: currentReadingGrade,
      newGrade: null,
      articlesRead: attempts.length,
      averageAccuracy,
    };
  }

  const nextGrade = config.allowGradeSkip
    ? config.gradeSequence[config.gradeSequence.length - 1] // skip to max if allowed
    : config.gradeSequence[currentIndex + 1];

  // Update child's reading grade
  await supabase
    .from("children")
    .update({ reading_grade_level: nextGrade })
    .eq("id", childId);

  return {
    leveledUp: true,
    currentGrade: currentReadingGrade,
    newGrade: nextGrade,
    articlesRead: attempts.length,
    averageAccuracy,
  };
}

/**
 * Get static progression config values (for frontend display).
 */
export function getProgressionConfig() {
  return {
    minArticlesRead: config.minArticlesRead,
    minAccuracyPct: config.minAccuracyPct,
    gradeSequence: config.gradeSequence,
    allowGradeSkip: config.allowGradeSkip,
  };
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: clean exit

- [ ] **Step 3: Commit**

```bash
git add src/lib/reading/progression.ts
git commit -m "feat: add reading level progression check logic"
```

**Rollback:** `git revert HEAD`

---

### Task 9: Wire progression check into quiz submit API

**Files:**
- Modify: `src/app/api/reading/quiz/submit/route.ts`

- [ ] **Step 1: Read current quiz submit handler**

```bash
cat src/app/api/reading/quiz/submit/route.ts
```

- [ ] **Step 2: Add progression check after quiz save**

After the quiz attempt is saved to DB, add:

```typescript
import { checkLevelProgression } from "@/lib/reading/progression";

// In POST handler, after successful quiz insert:
try {
  const progressionResult = await checkLevelProgression(childId);
  if (progressionResult.leveledUp) {
    console.log(`Child ${childId} leveled up: G${progressionResult.currentGrade} → G${progressionResult.newGrade}`);
  }
  // Include progression result in response
  return NextResponse.json({
    attempt: savedAttempt,
    progression: progressionResult,
  });
} catch (err) {
  // Progression check is non-blocking — log and return normal response
  console.warn("Progression check failed:", err);
  return NextResponse.json({
    attempt: savedAttempt,
    progression: null,
  });
}
```

- [ ] **Step 3: Compile check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: clean exit

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reading/quiz/submit/route.ts
git commit -m "feat: wire level-up progression check into quiz submit"
```

**Rollback:** `git revert HEAD`

---

### Task 10: Frontend filter for published-only articles

**Files:**
- Modify: `src/app/[locale]/(parent)/settings/reading/page.tsx` (reading list query)
- Search for other places that query reading_articles without status filter

- [ ] **Step 1: Find all article queries**

```bash
grep -rn "from.*reading_articles" src/app --include="*.tsx" --include="*.ts" | grep -v node_modules
```

- [ ] **Step 2: Add `.eq('status', 'published')` to each query**

Example pattern — in reading settings page or reading list component:

```typescript
// Before:
const { data } = await supabase.from('reading_articles').select('*').eq('language', 'en');

// After:
const { data } = await supabase
  .from('reading_articles')
  .select('*')
  .eq('language', 'en')
  .eq('status', 'published');
```

Add the same filter to all article queries that serve content to children readers.

- [ ] **Step 3: Commit**

```bash
git add <modified files>
git commit -m "fix: filter reading articles by status=published (hide archived)"
```

**Rollback:** `git revert HEAD`

---

### Task 11: Prune existing articles to target 40/grade

**Files:**
- One-time script: `scripts/prune-existing-articles.ts`

- [ ] **Step 1: Create prune script**

```typescript
/**
 * One-time script: prune articles to target 40/grade for English.
 * Archiving oldest surplus articles beyond the cap.
 *
 * Usage: npx tsx scripts/prune-existing-articles.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createServiceRoleClient } from "@/lib/supabase/server";

const TARGET_PER_GRADE = 40;

async function main() {
  const supabase = await createServiceRoleClient();
  
  for (let grade = 3; grade <= 10; grade++) {
    const { data: articles } = await supabase
      .from("reading_articles")
      .select("id, topic_key, created_at, word_count, status")
      .eq("language", "en")
      .eq("status", "published")
      .eq("grade_level", grade)
      .order("word_count", { ascending: false }); // keep longer (higher quality) articles

    if (!articles) continue;
    console.log(`G${grade}: ${articles.length} published`);

    if (articles.length <= TARGET_PER_GRADE) continue;

    // Keep the top TARGET_PER_GRADE by word_count, archive the rest
    const toArchive = articles.slice(TARGET_PER_GRADE);
    const ids = toArchive.map(a => a.id);
    
    // Log what we're archiving
    toArchive.forEach(a => {
      console.log(`  → archive: ${a.topic_key} (${a.word_count}w, ${a.created_at?.slice(0,10)})`);
    });

    const { error } = await supabase
      .from("reading_articles")
      .update({ status: "archived" })
      .in("id", ids);

    if (error) {
      console.error(`  Error archiving G${grade}: ${error.message}`);
    } else {
      console.log(`  Archived ${ids.length} articles for G${grade}`);
    }
  }
}

main().catch(console.error);
```

- [ ] **Step 2: Run in dry mode first**

```bash
# First, add --dry-run flag to preview
echo "Review the script above — it's written to archive by word_count desc (keep longest)"
```

- [ ] **Step 3: Run the script**

```bash
npx tsx scripts/prune-existing-articles.ts
```

Expected output: per-grade archive counts, no errors.

- [ ] **Step 4: Verify result**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await s.from('reading_articles').select('grade_level, status').eq('language', 'en');
  const byGrade = {};
  for (const a of data||[]) {
    if (!byGrade[a.grade_level]) byGrade[a.grade_level] = { published: 0, archived: 0, draft: 0 };
    byGrade[a.grade_level][a.status]++;
  }
  Object.entries(byGrade).sort().forEach(([k,v]) => console.log('G'+k+': published='+v.published+' archived='+v.archived));
})();
"
```

Expected: each grade ≤ 40 published.

- [ ] **Step 5: Commit**

```bash
git add scripts/prune-existing-articles.ts
git commit -m "feat: one-time prune script and execution — cap articles at 40/grade"
```

**Rollback:** `UPDATE reading_articles SET status='published' WHERE status='archived' AND language='en'`

---

### Task 12: Re-enable monthly cron (non-scheduled, manual dispatch)

**Files:**
- Modify: `.github/workflows/reading-content.yml`

**Background:** Cron was removed. Add it back but with the new pipeline logic. Run on 1st of each month.

- [ ] **Step 1: Add monthly schedule**

```yaml
on:
  schedule:
    # 1st of each month at 09:07 CST (01:07 UTC) — content refresh
    - cron: "7 1 1 * *"
  workflow_dispatch:
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/reading-content.yml
git commit -m "ci: re-enable monthly content refresh pipeline (1st of month)"
```

**Rollback:** `git revert HEAD`

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|-----------------|------|
| L4 level (G10) | Task 1 |
| Academic text type from G6 | Task 1 |
| Level-progression config | Task 2 |
| Archived status type | Task 3 |
| G3 chapterized generation | Task 4 |
| Depth anchors in chapter prompts | Task 5 |
| Cross-chapter coherence check | Task 6 |
| Per-grade cap 40 articles | Task 7 |
| Archive surplus (soft delete) | Task 7 |
| Monthly 20% rotation | Task 7 |
| Level-up progression module | Task 8 |
| Wire progression into quiz submit | Task 9 |
| Frontend published-only filter | Task 10 |
| Prune existing articles to 40 | Task 11 |
| Monthly cron re-enable | Task 12 |
