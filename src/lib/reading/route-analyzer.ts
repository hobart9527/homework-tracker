/**
 * Route Analyzer — source quality engine for the reading content pipeline.
 *
 * Decides whether each topic's source_text can be published as-is (Route A),
 * needs constrained rewriting (Route B), or requires full LLM generation
 * (Route C). Also expands target grades based on actual word count.
 *
 * See docs/pipeline-refactor-plan.md §二 for the frozen contract.
 */

import { getWordCountRange } from "./standards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Route = "A" | "B" | "C";

export interface RouteDecision {
  route: Route;
  expandedGrades: number[];
  reason: string;
}

export interface TopicRow {
  topic_key: string;
  language: "zh" | "en";
  source: string | null;
  source_text: string | null;
  content_completeness?: string | null;
  target_grades: number[] | null;
}

// ---------------------------------------------------------------------------
// Source whitelist — these sources have reliably good original text
// ---------------------------------------------------------------------------

const WHITELIST_SOURCES: Set<string> = new Set([
  "commonlit",
  "dogo",
  "news-in-levels",
  "icdl",
  "classic-corpus",
  "gushiwen",
]);

// ---------------------------------------------------------------------------
// Word / char counting
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Grade expansion — widen target_grades when word count qualifies
// ---------------------------------------------------------------------------

/**
 * Grade expansion removed per content quality refresh.
 * Each topic generates exactly for its target grade(s).
 * No cascading — grade coverage comes from having enough topics per level.
 */
export function expandGrades(
  _wordCount: number,
  baseGrade: number,
  _lang: "zh" | "en"
): number[] {
  return [baseGrade];
}

// ---------------------------------------------------------------------------
// Route decision
// ---------------------------------------------------------------------------

export function decideRoute(topic: TopicRow): RouteDecision {
  const sourceText = topic.source_text;
  const lang = topic.language;
  const baseGrade = topic.target_grades?.[0] ?? (lang === "en" ? 3 : 5);

  // Route C: no source text
  if (!sourceText || sourceText.trim().length < 50) {
    return {
      route: "C",
      expandedGrades: topic.target_grades ?? [baseGrade],
      reason: "no-source-text",
    };
  }

  const wordCount =
    lang === "en" ? countWords(sourceText) : sourceText.length;
  const isWhitelisted = WHITELIST_SOURCES.has(topic.source ?? "");

  // Route C: non-whitelisted source
  if (!isWhitelisted) {
    return {
      route: "C",
      expandedGrades: expandGrades(wordCount, baseGrade, lang),
      reason: `source-not-whitelisted:${topic.source ?? "unknown"}`,
    };
  }

  const bounds = getWordCountRange(lang, baseGrade);
  const wordInRange =
    wordCount >= bounds.min * 0.75 && wordCount <= bounds.max * 1.25;
  const hasFullContent =
    topic.content_completeness !== "excerpt" &&
    wordCount >= bounds.min * 0.5;

  // Route A: whitelisted + word count matches + full content
  if (wordInRange && hasFullContent) {
    return {
      route: "A",
      expandedGrades: expandGrades(wordCount, baseGrade, lang),
      reason: `whitelist:${topic.source}+word-match`,
    };
  }

  // Route B: whitelisted but needs adjustment
  return {
    route: "B",
    expandedGrades: expandGrades(wordCount, baseGrade, lang),
    reason: wordInRange ? "content-incomplete" : "word-mismatch",
  };
}
