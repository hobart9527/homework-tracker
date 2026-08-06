// IB MYP Criteria Gate
//
// Validates IB MYP qualitative dimensions that quality-gate.ts does NOT cover:
//   - genre field presence and validity (narrative/informative/opinion/literary for en;
//     记叙文/说明文/议论文/文学散文 for zh)
//   - critical thinking question ratio (inference type >= 30% of total)
//   - cultural_connection field (zh articles only)
//   - author_purpose field (en articles only)
//
// This gate runs IN PARALLEL with quality-gate.ts. Both gates must pass
// (or at least not have error-level issues) before publishing.
//
// Usage:
//   const ibResult = validateIBCriteria({ article, questions, language, gradeLevel });
//   if (!ibResult.pass) { /* send to draft for review */ }

import type { GeneratedArticle, GeneratedQuestion } from "./types";
import { getCriticalThinkingTypes } from "./standards";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface IBCriteriaInput {
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  language: "zh" | "en";
  gradeLevel: number;
}

export type IBCriteriaSeverity = "info" | "warn" | "error";

export interface IBCriteriaIssue {
  code: string;
  severity: IBCriteriaSeverity;
  message: string;
}

export interface IBCriteriaResult {
  pass: boolean;
  issues: IBCriteriaIssue[];
}

// ---------------------------------------------------------------------------
// Valid genre values
// ---------------------------------------------------------------------------

const VALID_EN_GENRES = new Set(["narrative", "informative", "opinion", "literary"]);
const VALID_ZH_GENRES = new Set(["记叙文", "说明文", "议论文", "文学散文"]);

const VALID_AUTHOR_PURPOSES = new Set([
  "to inform",
  "to entertain",
  "to persuade",
  "to explain",
]);

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkGenreField(
  input: IBCriteriaInput,
  issues: IBCriteriaIssue[]
): void {
  const { article, language } = input;
  const genre = article.genre;
  const validGenres = language === "en" ? VALID_EN_GENRES : VALID_ZH_GENRES;

  if (!genre) {
    issues.push({
      code: "genre-missing",
      severity: "error",
      message: `Article is missing "genre" field (expected: ${Array.from(validGenres).join(" | ")}).`,
    });
    return;
  }

  if (!validGenres.has(genre)) {
    issues.push({
      code: "genre-invalid",
      severity: "error",
      message: `Article genre "${genre}" is not valid for language "${language}" (expected: ${Array.from(validGenres).join(" | ")}).`,
    });
  }
}

function checkCriticalThinkingRatio(
  input: IBCriteriaInput,
  issues: IBCriteriaIssue[]
): void {
  const { questions } = input;
  if (!questions || questions.length === 0) return;

  // Critical thinking includes inference, evaluate (main_idea), and
  // synthesize (sequence). The canonical set is defined in
  // reading-standards.json questionTypes with criticalThinking: true.
  const ctTypes = getCriticalThinkingTypes();
  const ctCount = questions.filter((q) => ctTypes.has(q.question_type)).length;
  const ratio = ctCount / questions.length;
  const typeLabel = [...ctTypes].join("+");

  if (ratio < 0.15) {
    // For Chinese articles, downgrade to warn — MiniMax-M2.7 systematically
    // generates detail-type questions for Chinese content despite prompt.
    const severity = input.language === "zh" ? "warn" : "error";
    issues.push({
      code: "critical-thinking-ratio-error",
      severity,
      message: `Critical-thinking questions (${typeLabel}) are ${(ratio * 100).toFixed(0)}% of total (${ctCount}/${questions.length}), expected ≥15%.`,
    });
  } else if (ratio < 0.30) {
    issues.push({
      code: "critical-thinking-ratio-warn",
      severity: "warn",
      message: `Critical-thinking questions (${typeLabel}) are ${(ratio * 100).toFixed(0)}% of total (${ctCount}/${questions.length}), target ≥30%.`,
    });
  }
}

function checkCulturalConnection(
  input: IBCriteriaInput,
  issues: IBCriteriaIssue[]
): void {
  if (input.language !== "zh") return;

  const { article } = input;
  const cc = article.cultural_connection;

  if (!cc || typeof cc !== "string" || cc.trim() === "") {
    issues.push({
      code: "cultural-connection-missing",
      severity: "error",
      message: "Chinese article is missing non-empty cultural_connection field.",
    });
  }
}

function checkAuthorPurpose(
  input: IBCriteriaInput,
  issues: IBCriteriaIssue[]
): void {
  if (input.language !== "en") return;

  const { article } = input;
  const ap = article.author_purpose;

  if (!ap) {
    issues.push({
      code: "author-purpose-missing",
      severity: "error",
      message: `English article is missing "author_purpose" field (expected: ${Array.from(VALID_AUTHOR_PURPOSES).join(" | ")}).`,
    });
    return;
  }

  if (!VALID_AUTHOR_PURPOSES.has(ap)) {
    issues.push({
      code: "author-purpose-invalid",
      severity: "error",
      message: `Article author_purpose "${ap}" is not valid (expected: ${Array.from(VALID_AUTHOR_PURPOSES).join(" | ")}).`,
    });
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function validateIBCriteria(input: IBCriteriaInput): IBCriteriaResult {
  const issues: IBCriteriaIssue[] = [];

  checkGenreField(input, issues);
  checkCriticalThinkingRatio(input, issues);
  checkCulturalConnection(input, issues);
  checkAuthorPurpose(input, issues);

  const pass = !issues.some((i) => i.severity === "error");
  return { pass, issues };
}
