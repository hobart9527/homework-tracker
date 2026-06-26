# Reading Content Quality Refresh & Level Progression

## Context

Reading content production had gone quantity-over-quality: 1161 articles, 534 draft, 87 zero-word failures. Categories bilingual-mixed. Grade expansion per topic cascaded G3→G4→G6→G7→G8. Quality gate existed but was non-blocking.

Prior cleanup (2026-06-16): deleted 383 zh articles, 380 en failed/draft articles, normalized categories, flattened grade expansion, made quality gate blocking, stopped daily cron.

This spec covers the full redesign: per-grade caps (30-50 quality articles), chapterized generation for depth, IB PYP/MYP/L4 academic alignment, automatic level-up progression, and monthly refresh pipeline.

## Scope

G3-G10 English reading content only. Chinese deferred.

## Grade & Article Target

| Grade | Current | Target | Notes |
|-------|---------|--------|-------|
| G3 | 111 | 40 | needs pruning |
| G4 | 18 | 40 | needs ~22 new |
| G5 | 22 | 40 | needs ~18 new |
| G6 | 139 | 40 | needs pruning |
| G7 | 1 | 40 | needs ~39 new |
| G8 | 109 | 40 | needs pruning |
| G9 | 0 | 40 | new grade |
| G10 | 0 | 40 | new grade |
| **Total** | **400** | **320** | |

Pruning = `status = 'archived'` (soft delete, preserves quiz history).

## IB & Standards Framework

### Level Structure

| Level | Grades | IB Phase | Focus |
|-------|--------|----------|-------|
| L1 | G3-4 | PYP phase 3-4 | fiction + non-fiction, literal comprehension |
| L2 | G5-7 | MYP phase 1-2 | narrative + expository + intro academic (G6+) |
| L3 | G8-9 | MYP phase 3-4 | analytical + argumentative + academic |
| L4 | G10 | MYP phase 5 / DP prep | evidence-based reasoning, academic discourse |

### Text Type Distribution (adjusted)

| Type | L1 (G3-4) | L2 (G5-7) | L3 (G8-9) | L4 (G10) |
|------|:-:|:-:|:-:|:-:|
| fiction | 40% | 25% | 20% | 10% |
| non-fiction | 40% | 30% | 25% | 20% |
| poetry | 10% | 10% | 10% | 5% |
| drama | 5% | 10% | 10% | 5% |
| media | 5% | 10% | 15% | 20% |
| **academic** | **0%** | **15%** **(G6+)** | **20%** | **40%** |

Academic introduced from G6, not G8. G5 stays at 5% (as legacy L2 default).

### G10 / L4 Standard (new)

```
razLevels: ["Z1", "Z2"]
lexileBand: { min: 1200, max: 1400 }
wordCount: { min: 1500, max: 3000 }
syntax: { simple: 5, compound: 35, complex: 60 }
blooms: { literal: 0, infer: 1, evaluate: 3, synthesize: 3 }
chapterCount: 6
questionsPerChapter: 1
wordsPerChapter: { min: 250, max: 500 }
vocab: "GSL full + AWL full + academic vocabulary. Domain-specific terminology, nuanced arguments, rhetorical devices, evidence-based reasoning."
paragraphSentencesMin: 6, paragraphSentencesMax: 10
allowOpinion: true
themeWords: 18
```

## Chapterized Generation (Depth Fix)

### Problem

Single-block generation for G8-G10 articles (1000-3000 words) hits LLM token limits. Content is "continuity shallow" — plot flows but lacks depth in reasoning, evidence, and vocabulary tier.

### Solution: Full Chapterization

| Grade | Chapters | Why |
|-------|----------|-----|
| G3 | 2-3 | short breaks, keeps attention |
| G4 | 3 | transition phase |
| G5-7 | 4 | MYP standard |
| G8-9 | 5-6 | analytical depth |
| G10 | 6 | full academic structure |

### Chapter Prompt Changes

Each chapter prompt now includes:

1. **Previous chapter summary** — auto-injected from Phase 1 outline output
2. **IB learning target** — e.g. "this chapter must practice one inference and one evaluation question type"
3. **Depth anchor** — e.g. "include one direct quote from a cited source", "present a counterargument", "use at least 3 AWL tier-2 words"
4. **Transition check** — "do not repeat facts from chapter N, do not skip ahead of chapter N+2's scope"

### Cross-Chapter Consistency

Pipeline adds a lightweight ChapterCoherenceCheck after Phase 2:
- No fact contradiction between chapters
- Vocabulary tier consistent (no G3 word in G8 chapter)
- No chapter with 0 questions or 0 options

## Content Refresh (Monthly)

### Archive Strategy

- Each grade max 40 `published` articles
- Monthly pipeline run grades by grade distribution gap
- When over cap: `UPDATE status = 'archived'` on oldest articles (by `created_at` ASC)
- `reading_quiz_attempts` FK references preserved — archived articles still show history
- Frontend query: `WHERE status = 'published'`

### Pipeline Flow

```
1. Count published articles per grade
2. For each grade with deficit (target - actual > 0):
   a. Pick random topic from unused reading_topics
   b. Generate content → quality gate
   c. If gate pass → insert
   d. If gate fail → skip, log, try next topic
3. For each grade with surplus (actual - target > 0):
   a. Select oldest N articles
   b. UPDATE status = 'archived'
4. Print distribution report
```

### Staleness

Monthly pipeline also replaces 20% oldest articles per grade (oldest by `created_at` → archived). This keeps content "fresh" without total churn.

## Level-Up Progression

### Config File

New file: `config/reading-level-progression.json`

```json
{
  "version": 1,
  "minArticlesRead": 15,
  "minAccuracyPct": 75,
  "gradeSequence": [3, 4, 5, 6, 7, 8, 9, 10],
  "allowGradeSkip": false
}
```

### Check Trigger

Every quiz attempt submission:

1. Count completed assignments for child at current grade
2. If `count >= minArticlesRead`:
   - Calculate average accuracy across those attempts
   - If `avg >= minAccuracyPct`:
     - Update `children.reading_grade_level` to next grade in sequence
3. Return `{ leveledUp: true, newGrade: X }` or `{ leveledUp: false }`

### Notes

- `allowGradeSkip: false` means G3 → G4 → G5 only (no G3 → G5 jumping)
- Children with no `reading_grade_level` default to their `grade_level`
- Only grade sequence entries count (G3-G10 currently; no G1-2)

## Categories (Canonical)

Normalized to English only:

`science, culture, current, history, nature, biography, sport, news, stories`

## Quality Gate (Blocking)

- Gate runs after generation, before DB insert
- Checks: word count range, options completeness (exactly 4 per question), type distribution, classical_quote (zh), pinyin round-trip (zh)
- Gate fail → article skipped entirely (no draft storage)
- Dry-run mode: `--dry-run` flag previews gate result without DB writes

## Implementation Plan

### Phase 1: Config & Standards (files only)
1. Add L4 to `config/reading-standards.json`
2. Adjust textTypeDistribution (academic from G6)
3. Create `config/reading-level-progression.json`

### Phase 2: Chapterization Deepening
4. G3 chapter support (currently only G4+)
5. Chapter prompt enhancement: prev_chapter_summary, depth_anchor, transition_check
6. Cross-chapter consistency check

### Phase 3: Archive & Refresh Pipeline
7. Pipeline: count-per-grade, archive overshoot, fill deficit
8. Monthly cron (re-enable with new logic)

### Phase 4: Level-Up Backend
9. Progression check on quiz submit
10. Frontend: show level status, locked articles

## Verification

1. `config/reading-standards.json` has L4, adjusted textTypeDistribution
2. `config/reading-level-progression.json` exists and parsable
3. Pipeline dry-run shows per-grade distribution gaps
4. Pipeline run archives old articles (status=archived, not deleted)
5. Quiz submit triggers progression check
6. Child with 15 articles @ 80% → auto levels up
