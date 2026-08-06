/**
 * Factual Accuracy Gate — Tier 1/2 Source Fidelity Validator
 *
 * Validates that adapted content preserves key facts from the source text.
 * This gate is intentionally OPT-IN: it only runs when sourceText is provided.
 * Tier 3 (pure LLM generation, no sourceText) skips this gate entirely.
 *
 * Checks:
 *   1. checkFactsPreserved — LLM-declared fact preservation rate ≥ 80%
 *   2. checkSourceTextLength — adapted content not excessively bloated
 *   3. checkKeyFactMentions — manually-specified key facts appear ≥ once
 *
 * Usage:
 *   const factualResult = validateFactualAccuracy({
 *     article,
 *     sourceText: opts.sourceText,  // undefined for Tier 3
 *     language,
 *     gradeLevel,
 *     keyFacts: ["关键事件A", "关键人物B"],  // optional
 *   });
 *   if (!factualResult.pass) { send to draft }
 */

import type { GeneratedArticle } from "./types";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface FactualGateInput {
  article: GeneratedArticle;
  /** Source text used for adaptation. undefined/null means Tier 3 (pure LLM gen). */
  sourceText?: string;
  language: "zh" | "en";
  gradeLevel: number;
  /**
   * Content generation route:
   *   "A" — source text used directly (fidelity check applies)
   *   "B" — source text expanded/rewritten to grade level (bloat check skipped)
   *   "C" — pure LLM generation from topic (bloat check skipped)
   * When undefined, defaults to legacy behavior (bloat check applies).
   */
  route?: "A" | "B" | "C";
  /**
   * Optional manually-specified key facts that MUST appear in article.
   * Used when domain expert wants to enforce specific facts (e.g., specific
   * dates, names, numbers). Each string must appear ≥ 1 time in article.content.
   */
  keyFacts?: string[];
}

export type FactualGateSeverity = "info" | "warn" | "error";

export interface FactualGateIssue {
  code: string;
  severity: FactualGateSeverity;
  message: string;
}

export interface FactualGateResult {
  pass: boolean;
  issues: FactualGateIssue[];
}

// ---------------------------------------------------------------------------
// Helper: Chinese char count
// ---------------------------------------------------------------------------

const CHINESE_CHAR_RE = /[一-鿿]/g;

function countChineseChars(text: string): number {
  if (!text) return 0;
  return (text.match(CHINESE_CHAR_RE) || []).length;
}

function countEnglishWords(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function contentLength(text: string, lang: "zh" | "en"): number {
  return lang === "zh" ? countChineseChars(text) : countEnglishWords(text);
}

// ---------------------------------------------------------------------------
// Helper: simple keyword presence check
// ---------------------------------------------------------------------------

/**
 * Returns true if `needle` appears at least once in `haystack`.
 * For Chinese: checks character-level substring match.
 * For English: case-insensitive word-boundary match.
 */
function factMentioned(needle: string, haystack: string, lang: "zh" | "en"): boolean {
  if (!needle || !haystack) return false;
  if (lang === "zh") {
    return haystack.includes(needle);
  }
  const regex = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return regex.test(haystack);
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkFactsPreserved(
  input: FactualGateInput,
  issues: FactualGateIssue[]
): void {
  const { article } = input;
  const fa = article.factual_accuracy;

  if (!fa || !fa.source_facts_declared || fa.source_facts_declared.length === 0) {
    // No facts declared — skip this check (LLM may not have extracted facts)
    return;
  }

  const total = fa.source_facts_declared.length;
  const preserved = fa.facts_preserved_count ?? 0;
  const rate = preserved / total;

  if (rate < 0.6) {
    issues.push({
      code: "factual-accuracy-rate-error",
      severity: "error",
      message: `Factual accuracy rate is ${(rate * 100).toFixed(0)}% (${preserved}/${total} facts preserved). Expected ≥60%. Review source fidelity.`,
    });
  } else if (rate < 0.8) {
    issues.push({
      code: "factual-accuracy-rate-warn",
      severity: "warn",
      message: `Factual accuracy rate is ${(rate * 100).toFixed(0)}% (${preserved}/${total} facts preserved). Expected ≥80%.`,
    });
  }
}

function checkSourceTextLength(
  input: FactualGateInput,
  issues: FactualGateIssue[]
): void {
  const { article, sourceText, language, route } = input;

  if (!sourceText || !sourceText.trim()) return;

  // Route B (expand/rewrite) and Route C (pure LLM generation) intentionally
  // produce content much longer than the source text. The bloat ratio check
  // only applies to Route A (direct adaptation) where source is ground truth.
  if (route === "B" || route === "C") return;

  const sourceLen = contentLength(sourceText, language);
  const articleLen = contentLength(article.content, language);

  // Adapted content should not be more than 3x the source text length.
  // Extreme bloat suggests the LLM added invented content rather than adapting.
  const ratio = articleLen / sourceLen;

  if (ratio > 5) {
    issues.push({
      code: "content-bloat-error",
      severity: "error",
      message: `Adapted content (${articleLen} ${language === "zh" ? "chars" : "words"}) is ${ratio.toFixed(1)}x the source text (${sourceLen} ${language === "zh" ? "chars" : "words"}). Expected ≤5x.`,
    });
  } else if (ratio > 3) {
    issues.push({
      code: "content-bloat-warn",
      severity: "warn",
      message: `Adapted content (${articleLen} ${language === "zh" ? "chars" : "words"}) is ${ratio.toFixed(1)}x the source text (${sourceLen} ${language === "zh" ? "chars" : "words"}). Expected ≤3x.`,
    });
  }
}

function checkKeyFactMentions(
  input: FactualGateInput,
  issues: FactualGateIssue[]
): void {
  const { article, keyFacts, language } = input;

  if (!keyFacts || keyFacts.length === 0) return;

  for (const fact of keyFacts) {
    const mentioned = factMentioned(fact, article.content, language);
    if (!mentioned) {
      issues.push({
        code: "key-fact-missing",
        severity: "error",
        message: `Manually-specified key fact "${fact}" does not appear in article content.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function validateFactualAccuracy(input: FactualGateInput): FactualGateResult {
  // Tier 3: no source text → skip factual gate entirely
  if (!input.sourceText || !input.sourceText.trim()) {
    return { pass: true, issues: [] };
  }

  const issues: FactualGateIssue[] = [];

  checkFactsPreserved(input, issues);
  checkSourceTextLength(input, issues);
  checkKeyFactMentions(input, issues);

  const pass = !issues.some((i) => i.severity === "error");
  return { pass, issues };
}
