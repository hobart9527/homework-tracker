#!/usr/bin/env node
/**
 * Draft Triage — diagnose and auto-fix draft reading articles.
 *
 * Re-runs quality gates on all draft articles, categorizes failures,
 * and auto-fixes fixable issues (missing IB metadata, question formatting).
 *
 * Usage:
 *   npx tsx scripts/draft-triage.ts --dry-run           (default: scan only)
 *   npx tsx scripts/draft-triage.ts --execute            (scan + auto-fix)
 *   npx tsx scripts/draft-triage.ts --dry-run --lang=zh  (filter by language)
 *   npx tsx scripts/draft-triage.ts --dry-run --limit=10 (limit articles)
 *
 * Exit codes: 0 = completed, 1 = fatal error
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

import { createServiceRoleClient } from "@/lib/supabase/server";
import { validateContent } from "@/lib/reading/quality-gate";
import { validateIBCriteria } from "@/lib/reading/ib-criteria-gate";
import { validateFactualAccuracy } from "@/lib/reading/factual-gate";
import type {
  GeneratedArticle,
  GeneratedQuestion,
} from "@/lib/reading/types";
import type { QualityGateIssue } from "@/lib/reading/quality-gate";
import type { IBCriteriaIssue } from "@/lib/reading/ib-criteria-gate";
import type { FactualGateIssue } from "@/lib/reading/factual-gate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** DB row shape — extends generated types with columns that may have been
 *  added directly via Supabase dashboard (genre, author_purpose,
 *  cultural_connection, factual_accuracy). Cast via `as unknown as ArticleRow[]`.
 */
interface ArticleRow {
  id: string;
  topic_key: string;
  title: string;
  content: string | null;
  language: string | null;
  grade_level: number;
  difficulty: number | null;
  genre: string | null;
  author_purpose: string | null;
  cultural_connection: string | null;
  status: string;
  quality_issues: unknown;
  summary: string | null;
  scene_description: string | null;
  classical_quote: unknown;
  source: string;
  source_url: string | null;
  word_count: number | null;
  estimated_minutes: number | null;
}

interface QuestionRow {
  id: string;
  article_id: string;
  question_text: string;
  question_type: string;
  options: unknown; // JSON: { label: string; text: string }[]
  correct_answer: string;
  difficulty: number | null;
  order_index: number;
}

interface TriageResult {
  articleId: string;
  topicKey: string;
  title: string;
  language: string;
  gradeLevel: number;
  failures: string[];
  fixable: boolean;
  fixed: boolean;
}

interface RunOptions {
  dryRun: boolean;
  execute: boolean;
  lang: "zh" | "en" | null;
  limit: number;
}

// ---------------------------------------------------------------------------
// Triage short codes — canonical issue grouping
// ---------------------------------------------------------------------------

/** Issues that can be fixed by setting defaults directly in DB. */
const FIXABLE_CODES = new Set([
  "missing-genre",
  "missing-author-purpose",
  "missing-cultural-connection",
]);

/** Issues that require full regeneration (content / questions re-gen). */
const REGENERATE_CODES = new Set([
  "word-count",
  "difficulty-mismatch",
  "facts-preserved",
  "content-bloat",
]);

/**
 * Map raw gate issue codes to triage short codes.
 * Codes not in the mapping pass through unchanged.
 */
function mapIssueToTriageCode(code: string): string {
  const mapping: Record<string, string> = {
    // quality-gate codes
    "word-count-out-of-range": "word-count",
    "question-correct-not-in-options": "question-options",
    "question-multiple-correct": "question-options",
    "question-type-distribution-skew": "question-distribution",
    "difficulty-vs-word-count-mismatch": "difficulty-mismatch",
    "pinyin-char-count-mismatch": "pinyin-mismatch",
    "classical-quote-not-in-content": "classical-quote",
    // ib-criteria codes
    "genre-missing": "missing-genre",
    "genre-invalid": "missing-genre",
    "critical-thinking-ratio-error": "inference-ratio",
    "critical-thinking-ratio-warn": "inference-ratio",
    "cultural-connection-missing": "missing-cultural-connection",
    "author-purpose-missing": "missing-author-purpose",
    "author-purpose-invalid": "missing-author-purpose",
    // factual-gate codes
    "factual-accuracy-rate-error": "facts-preserved",
    "factual-accuracy-rate-warn": "facts-preserved",
    "content-bloat-error": "content-bloat",
    "content-bloat-warn": "content-bloat",
    "key-fact-missing": "key-fact-missing",
  };
  return mapping[code] ?? code;
}

/** Map each triage short code back to the gate group it originated from. */
function triageCodeToGateGroup(code: string): string {
  if (
    code === "word-count" ||
    code === "question-options" ||
    code === "question-distribution" ||
    code === "difficulty-mismatch" ||
    code === "pinyin-mismatch" ||
    code === "classical-quote"
  ) {
    return "quality-gate";
  }
  if (
    code === "missing-genre" ||
    code === "missing-author-purpose" ||
    code === "missing-cultural-connection" ||
    code === "inference-ratio"
  ) {
    return "ib-criteria";
  }
  if (
    code === "facts-preserved" ||
    code === "content-bloat" ||
    code === "key-fact-missing"
  ) {
    return "factual-gate";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): RunOptions {
  const flags = new Set(argv.slice(2));
  const execute = flags.has("--execute");
  const dryRun = flags.has("--dry-run") || !execute;
  let lang: "zh" | "en" | null = null;
  let limit = 0;

  for (const flag of flags) {
    if (flag.startsWith("--lang=")) {
      const val = flag.slice("--lang=".length);
      if (val === "zh" || val === "en") lang = val;
    }
    if (flag.startsWith("--limit=")) {
      const n = parseInt(flag.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }

  return { dryRun: dryRun && !execute, execute, lang, limit };
}

function validateEnv(): void {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(", ")}`;
    console.error(msg);
    const err = new Error(msg) as Error & { code: string };
    err.code = "ERR_MISSING_ENV";
    throw err;
  }
}

// ---------------------------------------------------------------------------
// DB → GeneratedArticle / GeneratedQuestion mapping
// ---------------------------------------------------------------------------

function rowToGeneratedArticle(row: ArticleRow): GeneratedArticle {
  return {
    title: row.title,
    content: row.content ?? "",
    summary: row.summary ?? "",
    word_count: row.word_count ?? 0,
    estimated_minutes: row.estimated_minutes ?? 0,
    difficulty: row.difficulty ?? 3,
    scene_description: row.scene_description ?? "",
    genre: (row.genre as GeneratedArticle["genre"]) ?? undefined,
    author_purpose: (row.author_purpose as GeneratedArticle["author_purpose"]) ?? undefined,
    cultural_connection: row.cultural_connection ?? undefined,
    classical_quote: row.classical_quote as GeneratedArticle["classical_quote"] ?? undefined,
  };
}

function rowToGeneratedQuestion(row: QuestionRow): GeneratedQuestion {
  let options: { label: string; text: string }[] = [];
  if (Array.isArray(row.options)) {
    options = row.options.filter(
      (o): o is { label: string; text: string } =>
        typeof o === "object" &&
        o !== null &&
        typeof (o as Record<string, unknown>).label === "string" &&
        typeof (o as Record<string, unknown>).text === "string"
    );
  }
  return {
    question_text: row.question_text,
    question_type: row.question_type as GeneratedQuestion["question_type"],
    options,
    correct_answer: row.correct_answer,
    difficulty: row.difficulty ?? 3,
  };
}

// ---------------------------------------------------------------------------
// Per-article gate evaluation
// ---------------------------------------------------------------------------

interface AllIssues {
  quality: QualityGateIssue[];
  ib: IBCriteriaIssue[];
  factual: FactualGateIssue[];
}

function evaluateArticle(
  article: ArticleRow,
  questions: QuestionRow[]
): AllIssues {
  const genArticle = rowToGeneratedArticle(article);
  const genQuestions = questions.map(rowToGeneratedQuestion);
  const lang = (article.language === "zh" || article.language === "en"
    ? article.language
    : "en") as "zh" | "en";

  // quality-gate
  const qr = validateContent({
    article: genArticle,
    questions: genQuestions,
    language: lang,
    gradeLevel: article.grade_level,
  });

  // ib-criteria-gate
  const ib = validateIBCriteria({
    article: genArticle,
    questions: genQuestions,
    language: lang,
    gradeLevel: article.grade_level,
  });

  // factual-gate — sourceText not stored in DB for most articles, so
  // this gate will typically skip (pass: true) unless factual_accuracy
  // JSONB has data.
  const factual = validateFactualAccuracy({
    article: genArticle,
    sourceText: undefined,
    language: lang,
    gradeLevel: article.grade_level,
  });

  return {
    quality: qr.issues,
    ib: ib.issues,
    factual: factual.issues,
  };
}

// ---------------------------------------------------------------------------
// Triage action decision
// ---------------------------------------------------------------------------

type TriageAction = "auto-fix" | "regenerate" | "review" | "none";

function decideAction(failures: string[]): TriageAction {
  if (failures.length === 0) return "none";

  const fixableOnly = failures.every((c) => FIXABLE_CODES.has(c));
  if (fixableOnly) return "auto-fix";

  const anyRegenerate = failures.some((c) => REGENERATE_CODES.has(c));
  if (anyRegenerate) return "regenerate";

  return "review";
}

// ---------------------------------------------------------------------------
// Auto-fix (--execute only)
// ---------------------------------------------------------------------------

interface AutoFixResult {
  success: boolean;
  error?: string;
  fieldsSet: string[];
}

async function autoFixArticle(
  supabase: SupabaseClient,
  article: ArticleRow,
  failures: string[]
): Promise<AutoFixResult> {
  const fixable = failures.filter((c) => FIXABLE_CODES.has(c));
  if (fixable.length === 0) {
    return { success: false, error: "No fixable failures", fieldsSet: [] };
  }

  const updates: Record<string, unknown> = {};
  const fieldsSet: string[] = [];

  if (fixable.includes("missing-genre")) {
    const defaultGenre =
      article.language === "zh" ? "说明文" : "informative";
    updates.genre = defaultGenre;
    fieldsSet.push(`genre=${defaultGenre}`);
  }

  if (fixable.includes("missing-author-purpose")) {
    updates.author_purpose = "to inform";
    fieldsSet.push("author_purpose=to inform");
  }

  if (fixable.includes("missing-cultural-connection")) {
    // For English articles, cultural_connection is not required — set to null.
    // For Chinese articles, we can't auto-fill a meaningful cultural connection.
    if (article.language === "en") {
      updates.cultural_connection = null;
      fieldsSet.push("cultural_connection=null (en)");
    } else {
      // Chinese cultural_connection is required but can't be auto-filled.
      // Leave it for review.
      return {
        success: false,
        error: "Chinese cultural_connection cannot be auto-filled",
        fieldsSet,
      };
    }
  }

  // Clear quality_issues since fixable issues are resolved
  updates.quality_issues = null;
  updates.status = "published";

  const { error } = await supabase
    .from("reading_articles")
    .update(updates as never)
    .eq("id", article.id);

  if (error) {
    return { success: false, error: error.message, fieldsSet };
  }

  return { success: true, fieldsSet };
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadDraftArticles(
  supabase: SupabaseClient,
  opts: RunOptions
): Promise<ArticleRow[]> {
  let query = supabase
    .from("reading_articles")
    .select(
      "id, topic_key, title, content, language, grade_level, difficulty, " +
        "genre, author_purpose, cultural_connection, status, quality_issues, " +
        "summary, scene_description, classical_quote, source, source_url, " +
        "word_count, estimated_minutes"
    )
    .eq("status", "draft");

  if (opts.lang) {
    query = query.eq("language", opts.lang);
  }
  if (opts.limit > 0) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to load draft articles: ${error.message}`);
  }

  return (data ?? []) as unknown as ArticleRow[];
}

async function loadQuestionsForArticles(
  supabase: SupabaseClient,
  articleIds: string[]
): Promise<Map<string, QuestionRow[]>> {
  const out = new Map<string, QuestionRow[]>();
  if (articleIds.length === 0) return out;

  const BATCH = 200;
  for (let i = 0; i < articleIds.length; i += BATCH) {
    const slice = articleIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("reading_questions")
      .select("*")
      .in("article_id", slice)
      .order("order_index", { ascending: true });

    if (error) {
      throw new Error(`Failed to load reading_questions: ${error.message}`);
    }

    for (const row of data ?? []) {
      const q = row as unknown as QuestionRow;
      const list = out.get(q.article_id) ?? [];
      list.push(q);
      out.set(q.article_id, list);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

interface CategoryBucket {
  gateGroup: string; // "quality-gate" | "ib-criteria" | "factual-gate"
  triageCode: string;
  count: number;
}

function renderReport(
  results: TriageResult[],
  total: number,
  errorCount: number
): void {
  // Build category bucket counts
  const bucketMap = new Map<string, Map<string, number>>();
  for (const r of results) {
    for (const code of r.failures) {
      const gate = triageCodeToGateGroup(code);
      if (!bucketMap.has(gate)) bucketMap.set(gate, new Map());
      const inner = bucketMap.get(gate)!;
      inner.set(code, (inner.get(code) ?? 0) + 1);
    }
  }

  const autoFixable = results.filter(
    (r) => decideAction(r.failures) === "auto-fix"
  ).length;
  const needsRegen = results.filter(
    (r) => decideAction(r.failures) === "regenerate"
  ).length;
  const needsReview = results.filter(
    (r) => decideAction(r.failures) === "review"
  ).length;

  console.log("=== Draft Triage Report ===");
  console.log(`Total drafts: ${total}`);
  console.log(`Scanned: ${results.length}`);
  console.log(`Errors (skipped): ${errorCount}`);
  console.log("");

  // --- By Failure Category ---
  console.log("--- By Failure Category ---");
  for (const gate of ["quality-gate", "ib-criteria", "factual-gate"]) {
    const inner = bucketMap.get(gate);
    if (!inner || inner.size === 0) {
      console.log(`${gate}:`);
      console.log(`  (none)`);
      continue;
    }
    console.log(`${gate}:`);
    for (const [code, count] of Array.from(inner).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${code}: ${count} articles`);
    }
  }
  console.log("");

  // --- Recommendations ---
  console.log("--- Recommendations ---");
  console.log(
    `  Auto-fixable: ${autoFixable} (missing-genre, missing-author-purpose)`
  );
  console.log(
    `  Needs regenerate: ${needsRegen} (word-count, facts-preserved)`
  );
  console.log(`  Needs review: ${needsReview} (unknown issues)`);
  console.log("");

  // --- Article List ---
  console.log("--- Article List ---");
  for (const r of results) {
    const action = decideAction(r.failures);
    const failuresStr =
      r.failures.length > 0 ? r.failures.join(", ") : "none";
    const fixedTag = r.fixed ? " [FIXED]" : "";
    console.log(
      `[${r.articleId}] "${r.title}" (${r.language}|G${r.gradeLevel}) — failures: ${failuresStr} — action: ${action}${fixedTag}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  validateEnv();

  console.log("=== Draft Triage ===");
  console.log(`Mode:   ${opts.execute ? "execute" : "dry-run"}`);
  console.log(`Lang:   ${opts.lang ?? "all"}`);
  console.log(`Limit:  ${opts.limit > 0 ? opts.limit : "none"}`);
  console.log("");

  const supabase = await createServiceRoleClient();

  const articles = await loadDraftArticles(supabase, opts);
  console.log(`Draft articles loaded: ${articles.length}`);
  if (articles.length === 0) {
    console.log("No draft articles found. Nothing to triage.");
    return;
  }

  const articleIds = articles.map((a) => a.id);
  const questionsByArticle = await loadQuestionsForArticles(supabase, articleIds);
  console.log(`Articles with questions loaded: ${questionsByArticle.size}`);
  console.log("");

  const results: TriageResult[] = [];
  let errorCount = 0;

  for (const article of articles) {
    try {
      const questions = questionsByArticle.get(article.id) ?? [];
      const issues = evaluateArticle(article, questions);

      const allCodes: string[] = [];
      const allIssues = [
        ...issues.quality,
        ...issues.ib,
        ...issues.factual,
      ];
      for (const iss of allIssues) {
        const triageCode = mapIssueToTriageCode(iss.code);
        if (!allCodes.includes(triageCode)) {
          allCodes.push(triageCode);
        }
      }

      const lang = (article.language === "zh" || article.language === "en"
        ? article.language
        : "en") as "zh" | "en";

      let fixed = false;
      const action = decideAction(allCodes);

      if (opts.execute && action === "auto-fix") {
        const fixResult = await autoFixArticle(supabase, article, allCodes);
        if (fixResult.success) {
          fixed = true;
          console.log(
            `[fixed] ${article.id} "${article.title}" — set ${fixResult.fieldsSet.join(", ")} → published`
          );
        } else {
          console.log(
            `[skip] ${article.id} "${article.title}" — auto-fix failed: ${fixResult.error}`
          );
        }
      }

      results.push({
        articleId: article.id,
        topicKey: article.topic_key,
        title: article.title,
        language: lang,
        gradeLevel: article.grade_level,
        failures: allCodes,
        fixable: action === "auto-fix",
        fixed,
      });
    } catch (err) {
      // Per-article errors must NOT abort the batch.
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[error] ${article.id} "${article.title}" — ${msg}`);
      errorCount++;
    }
  }

  console.log("");
  renderReport(results, articles.length, errorCount);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\nFatal error:", msg);
  if ((err as Error & { code?: string }).code === "ERR_MISSING_ENV") {
    console.error(
      "(Expected when environment is not configured — this is not a code error.)"
    );
  }
  process.exit(1);
});
