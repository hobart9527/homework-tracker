// Reading content quality gate (Wave 0 §3.9 frozen contract).
//
// Performs purely-objective post-generation checks on a GeneratedArticle +
// GeneratedQuestion[] pair. The gate is intentionally side-effect free and
// does NOT call any external service: it inspects shape, ranges, and uses
// the local pinyin converter to confirm round-tripping for Chinese content.
//
// Returns a QualityGateResult that callers (Wave 3 generation pipeline) use
// to decide whether to publish the article or send it to draft for review.

import type { GeneratedArticle, GeneratedQuestion } from "./types";
import { convertToRubyPinyin } from "./pinyin-converter";
import { getWordCountRange, type WordCountRange } from "./standards";

// ---------------------------------------------------------------------------
// Public contract (frozen — see ~/.planning/reading-pipeline-task-plan §3.9)
// ---------------------------------------------------------------------------

export interface QualityGateInput {
  article: GeneratedArticle;
  questions: GeneratedQuestion[];
  language: "zh" | "en";
  gradeLevel: number;
}

export type QualityGateSeverity = "info" | "warn" | "error";

export interface QualityGateIssue {
  code: string;
  severity: QualityGateSeverity;
  message: string;
}

export interface QualityGateResult {
  /** false if any issue has severity === "error" */
  pass: boolean;
  /** "draft" when !pass, otherwise "published" */
  recommended_status: "published" | "draft";
  issues: QualityGateIssue[];
}

// ---------------------------------------------------------------------------
// Word-count expected ranges (per task-plan §6 / content-generator.ts).
// ---------------------------------------------------------------------------

function expectedRangeEn(grade: number) {
  return getWordCountRange('en', grade);
}

function expectedRangeZh(grade: number) {
  return getWordCountRange('zh', grade);
}

// ---------------------------------------------------------------------------
// Counting helpers.
// ---------------------------------------------------------------------------

const CHINESE_CHAR_RE = /[一-鿿]/g;

function countEnglishWords(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function countChineseChars(content: string): number {
  if (!content) return 0;
  return (content.match(CHINESE_CHAR_RE) || []).length;
}

/**
 * Returns the relative deviation of `actual` from the closest edge of the
 * inclusive [min, max] range. Within-range → 0. Below/above → fraction of
 * the nearest bound.
 *
 * Example: range 300-450, actual=200 → deviation = (300-200)/300 = 0.333.
 */
function rangeDeviation(actual: number, range: WordCountRange): number {
  if (actual >= range.min && actual <= range.max) return 0;
  if (actual < range.min) {
    return (range.min - actual) / range.min;
  }
  return (actual - range.max) / range.max;
}

// ---------------------------------------------------------------------------
// Individual checks. Each pushes 0..N issues into the shared list.
// ---------------------------------------------------------------------------

function checkWordCount(
  input: QualityGateInput,
  issues: QualityGateIssue[]
): void {
  const { article, language, gradeLevel } = input;
  const range =
    language === "en" ? expectedRangeEn(gradeLevel) : expectedRangeZh(gradeLevel);
  const actual =
    language === "en"
      ? countEnglishWords(article.content)
      : countChineseChars(article.content);
  const dev = rangeDeviation(actual, range);
  if (dev <= 0.2) return; // within tolerance
  const severity: QualityGateSeverity = dev > 0.3 ? "error" : "warn";
  const unit = language === "en" ? "words" : "Chinese characters";
  issues.push({
    code: "word-count-out-of-range",
    severity,
    message: `Article has ${actual} ${unit}; expected ${range.min}-${range.max} for grade ${gradeLevel} ${language} (deviation ${(dev * 100).toFixed(0)}%).`,
  });
}

function checkQuestionOptionsAndCorrect(
  input: QualityGateInput,
  issues: QualityGateIssue[]
): void {
  input.questions.forEach((q, idx) => {
    const opts = q.options;
    if (!Array.isArray(opts)) {
      issues.push({
        code: "question-options-not-array",
        severity: "error",
        message: `Question #${idx + 1} options is not an array (got ${typeof opts}).`,
      });
      return;
    }
    const labels = opts.map((o) => o?.label);
    if (labels.length !== 4) {
      issues.push({
        code: "question-correct-not-in-options",
        severity: "error",
        message: `Question #${idx + 1} has ${labels.length} options (expected 4).`,
      });
      return;
    }
    if (!labels.includes(q.correct_answer)) {
      issues.push({
        code: "question-correct-not-in-options",
        severity: "error",
        message: `Question #${idx + 1} correct_answer "${q.correct_answer}" is not in options [${labels.join(", ")}].`,
      });
    }
    const matchingLabels = labels.filter((l) => l === q.correct_answer);
    if (matchingLabels.length > 1) {
      issues.push({
        code: "question-multiple-correct",
        severity: "error",
        message: `Question #${idx + 1} has ${matchingLabels.length} options with label "${q.correct_answer}" (expected exactly 1).`,
      });
    }
  });
}

function checkQuestionTypeDistribution(
  input: QualityGateInput,
  issues: QualityGateIssue[]
): void {
  const { questions, gradeLevel } = input;
  if (questions.length < 4) return;
  const counts = new Map<string, number>();
  for (const q of questions) {
    counts.set(q.question_type, (counts.get(q.question_type) ?? 0) + 1);
  }
  const total = questions.length;
  for (const [type, n] of counts) {
    const ratio = n / total;
    if (ratio < 0.8) continue;
    // Allow detail to be up to 60% (i.e. <= 0.6) for G3-4. The 80% threshold
    // already exceeds that allowance, so any 80%+ detail concentration still
    // warns even for G3-4.
    if (type === "detail" && gradeLevel <= 4 && ratio <= 0.6) continue;
    issues.push({
      code: "question-type-distribution-skew",
      severity: "warn",
      message: `${(ratio * 100).toFixed(0)}% of questions are of type "${type}" (${n}/${total}); distribution is skewed.`,
    });
  }
}

function checkDifficultyVsWordCount(
  input: QualityGateInput,
  issues: QualityGateIssue[]
): void {
  const { article, language } = input;
  const wordCount =
    language === "en"
      ? countEnglishWords(article.content)
      : countChineseChars(article.content);
  const diff = article.difficulty;
  if (diff <= 2 && wordCount > 600) {
    issues.push({
      code: "difficulty-vs-word-count-mismatch",
      severity: "info",
      message: `Easy article (difficulty=${diff}) is unusually long (${wordCount} ${language === "en" ? "words" : "chars"}).`,
    });
  } else if (diff >= 4) {
    const tooShort = language === "en" ? wordCount < 200 : wordCount < 80;
    if (tooShort) {
      issues.push({
        code: "difficulty-vs-word-count-mismatch",
        severity: "info",
        message: `Hard article (difficulty=${diff}) is unusually short (${wordCount} ${language === "en" ? "words" : "chars"}).`,
      });
    }
  }
}

function checkPinyinCharCount(
  input: QualityGateInput,
  issues: QualityGateIssue[]
): void {
  if (input.language !== "zh") return;
  const { article } = input;
  const original = countChineseChars(article.content);
  let converted: string;
  try {
    converted = convertToRubyPinyin(article.content);
  } catch (err) {
    issues.push({
      code: "pinyin-char-count-mismatch",
      severity: "error",
      message: `Pinyin conversion threw: ${(err as Error).message}.`,
    });
    return;
  }
  const roundTrip = countChineseChars(converted);
  if (roundTrip !== original) {
    issues.push({
      code: "pinyin-char-count-mismatch",
      severity: "error",
      message: `Pinyin round-trip Chinese char count mismatch: original=${original}, after-convert=${roundTrip}.`,
    });
  }
}

function checkClassicalQuoteInContent(
  input: QualityGateInput,
  issues: QualityGateIssue[]
): void {
  if (input.language !== "zh") return;
  const { article } = input;
  const quote = article.classical_quote;
  if (!quote || !quote.original) {
    issues.push({
      code: "classical-quote-not-in-content",
      severity: "warn",
      message: "Chinese article is missing classical_quote.original.",
    });
    return;
  }
  if (!article.content.includes(quote.original)) {
    issues.push({
      code: "classical-quote-not-in-content",
      severity: "warn",
      message: `classical_quote.original "${quote.original}" is not present in article.content.`,
    });
  }
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

export function validateContent(input: QualityGateInput): QualityGateResult {
  const issues: QualityGateIssue[] = [];

  checkWordCount(input, issues);
  checkQuestionOptionsAndCorrect(input, issues);
  checkQuestionTypeDistribution(input, issues);
  checkDifficultyVsWordCount(input, issues);
  checkPinyinCharCount(input, issues);
  checkClassicalQuoteInContent(input, issues);

  const pass = !issues.some((i) => i.severity === "error");
  return {
    pass,
    recommended_status: pass ? "published" : "draft",
    issues,
  };
}
