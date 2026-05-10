#!/usr/bin/env node
/**
 * Detect "problem articles" in reading_articles by combining two signals:
 *   A) accuracy drift  — kids consistently fail this article in quizzes.
 *   B) difficulty mismatch — LLM-rated `difficulty` disagrees with the
 *      objective `calculateObjectiveDifficulty()` calculation by > 1.
 *
 * Cron-compatible. Two CLI modes:
 *   --dry-run (default): print findings; no DB writes.
 *   --execute:           merge the issue codes into reading_articles.quality_issues
 *                        for flagged articles AND write a JSON report under
 *                        /tmp/drift-report-{ts}.json.
 *
 * Recommendation rule:
 *   both signals          -> "regenerate"
 *   accuracy_drift only   -> "regenerate"
 *   difficulty_mismatch   -> "tag_only"
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (required)
 *   DRIFT_MIN_ATTEMPTS         default 5    (Signal A floor)
 *   DRIFT_ACCURACY_THRESHOLD   default 0.55 (Signal A ceiling on avg accuracy)
 *   DRIFT_LIMIT                default 0    (0 = no limit on candidate articles)
 *
 * Idempotency:
 *   - Per-article quality_issues is treated as a string[] of issue codes.
 *   - We merge new codes (`drift-accuracy`, `difficulty-mismatch`) with
 *     existing entries and de-dupe. Re-running on the same data produces
 *     the same flags and the same persisted set.
 *
 * NO LLM calls. NO regeneration. NO row deletion.
 *
 * Exit codes:
 *   0 — completed (including 0 candidates and migration-required env-fail)
 *   1 — fatal env or DB error
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateObjectiveDifficulty } from "@/lib/reading/difficulty";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Local row shape: language / raz_level / quality_issues are added by later
// migrations and may not be exposed by the generated Database types yet. We
// cast at the query boundary via `as unknown as ArticleRow[]`, matching the
// pattern used in synthesize-chinese-audio.ts and archive-stale-news.ts.
interface ArticleRow {
  id: string;
  topic_key: string;
  title: string;
  content: string | null;
  language: string | null;
  raz_level: string | null;
  difficulty: number | null;
  status: string;
  quality_issues: unknown;
}

interface AttemptRow {
  article_id: string;
  score: number;
  total_questions: number;
}

type SignalCode = "accuracy_drift" | "difficulty_mismatch";
type Recommendation = "regenerate" | "tag_only" | "review";

interface FlaggedArticle {
  article_id: string;
  topic_key: string;
  title: string;
  language: string | null;
  raz_level: string | null;
  signals: SignalCode[];
  metrics: {
    attempts: number;
    avg_accuracy: number | null;
    llm_difficulty: number | null;
    calc_difficulty: number | null;
    indicators: Record<string, unknown>;
  };
  recommendation: Recommendation;
}

interface DriftReport {
  ranAt: string;
  totalArticles: number;
  flagged: FlaggedArticle[];
  summary: {
    flagged_total: number;
    accuracy_drift: number;
    difficulty_mismatch: number;
    both: number;
    regenerate: number;
    tag_only: number;
    review: number;
    errors: number;
  };
}

interface RunOptions {
  dryRun: boolean;
  execute: boolean;
}

// quality_issues issue codes persisted on reading_articles.
const ISSUE_CODE_ACCURACY = "drift-accuracy";
const ISSUE_CODE_MISMATCH = "difficulty-mismatch";

// ---------------------------------------------------------------------------
// CLI parsing (no new npm dep)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): RunOptions {
  const flags = new Set(argv.slice(2));
  const execute = flags.has("--execute");
  const dryRun = flags.has("--dry-run") || !execute; // default to dry-run
  return { dryRun: dryRun && !execute, execute };
}

// ---------------------------------------------------------------------------
// Environment validation / config
// ---------------------------------------------------------------------------

function validateEnv(): void {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error(
      "Ensure these are set in .env.local or in the cron job environment."
    );
    const err = new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    ) as Error & { code: string };
    err.code = "ERR_MISSING_ENV";
    throw err;
  }
}

function getMinAttempts(): number {
  const raw = process.env.DRIFT_MIN_ATTEMPTS;
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return 5;
  return n;
}

function getAccuracyThreshold(): number {
  const raw = process.env.DRIFT_ACCURACY_THRESHOLD;
  if (!raw) return 0.55;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0 || n >= 1) return 0.55;
  return n;
}

function getLimit(): number {
  const raw = process.env.DRIFT_LIMIT;
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeIssueArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function mergeIssueCodes(existing: unknown, additions: string[]): string[] {
  const merged = new Set<string>(normalizeIssueArray(existing));
  for (const code of additions) merged.add(code);
  return Array.from(merged).sort();
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function decideRecommendation(signals: SignalCode[]): Recommendation {
  const hasAcc = signals.includes("accuracy_drift");
  const hasMis = signals.includes("difficulty_mismatch");
  if (hasAcc && hasMis) return "regenerate";
  if (hasAcc) return "regenerate";
  if (hasMis) return "tag_only";
  return "review";
}

function isMigrationMissingError(msg: string): boolean {
  return (
    msg.includes("language") ||
    msg.includes("raz_level") ||
    msg.includes("quality_issues") ||
    msg.includes("does not exist")
  );
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadPublishedArticles(
  supabase: SupabaseClient,
  limit: number
): Promise<ArticleRow[]> {
  let query = supabase
    .from("reading_articles")
    .select(
      "id, topic_key, title, content, language, raz_level, difficulty, status, quality_issues"
    )
    .eq("status", "published");

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    const msg = error.message || "";
    if (isMigrationMissingError(msg)) {
      throw new Error(
        `reading_articles missing language / raz_level / quality_issues columns — migration required. (${msg})`
      );
    }
    throw new Error(`Failed to load articles: ${msg}`);
  }

  return (data ?? []) as unknown as ArticleRow[];
}

/**
 * Load all reading_quiz_attempts rows for the supplied article IDs and
 * aggregate them per article. Aggregation is done in JS to avoid relying on
 * a server-side view; the volume here is a few thousand rows at most.
 */
async function loadAccuracyByArticle(
  supabase: SupabaseClient,
  articleIds: string[]
): Promise<Map<string, { attempts: number; avgAccuracy: number }>> {
  const out = new Map<string, { attempts: number; avgAccuracy: number }>();
  if (articleIds.length === 0) return out;

  // Batch the IN clause to keep URLs short on Postgres / PostgREST.
  const BATCH = 200;
  const sums = new Map<string, { sum: number; n: number }>();

  for (let i = 0; i < articleIds.length; i += BATCH) {
    const slice = articleIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("reading_quiz_attempts")
      .select("article_id, score, total_questions")
      .in("article_id", slice);

    if (error) {
      throw new Error(`Failed to load reading_quiz_attempts: ${error.message}`);
    }

    for (const row of (data ?? []) as unknown as AttemptRow[]) {
      if (!row || typeof row.score !== "number" || typeof row.total_questions !== "number") {
        continue;
      }
      if (row.total_questions <= 0) continue;
      const acc = row.score / row.total_questions;
      if (!Number.isFinite(acc)) continue;
      const cur = sums.get(row.article_id) ?? { sum: 0, n: 0 };
      cur.sum += acc;
      cur.n += 1;
      sums.set(row.article_id, cur);
    }
  }

  for (const [id, { sum, n }] of sums.entries()) {
    out.set(id, { attempts: n, avgAccuracy: n > 0 ? sum / n : 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-article evaluation
// ---------------------------------------------------------------------------

interface EvalContext {
  minAttempts: number;
  accuracyThreshold: number;
  accuracyByArticle: Map<string, { attempts: number; avgAccuracy: number }>;
}

function evaluateArticle(
  article: ArticleRow,
  ctx: EvalContext
): FlaggedArticle | null {
  const signals: SignalCode[] = [];
  const stats = ctx.accuracyByArticle.get(article.id);
  const attempts = stats?.attempts ?? 0;
  const avgAccuracy = stats ? round2(stats.avgAccuracy) : null;

  // Signal A — accuracy drift
  if (
    stats &&
    stats.attempts >= ctx.minAttempts &&
    stats.avgAccuracy < ctx.accuracyThreshold
  ) {
    signals.push("accuracy_drift");
  }

  // Signal B — difficulty mismatch (only when content + difficulty + raz_level
  // are all present and language is one we can score).
  let calcDifficulty: number | null = null;
  let indicators: Record<string, unknown> = {};
  const hasContent = !!article.content && article.content.trim().length > 0;
  const lang = article.language === "zh" || article.language === "en" ? article.language : null;
  if (
    hasContent &&
    typeof article.difficulty === "number" &&
    article.raz_level !== null &&
    lang !== null
  ) {
    const result = calculateObjectiveDifficulty({
      content: article.content as string,
      language: lang,
      gradeLevel: 1, // not used by the calc beyond shape — actual signal is llm vs calc
      llmDifficulty: article.difficulty,
    });
    calcDifficulty = result.difficulty;
    indicators = result.indicators as Record<string, unknown>;
    if (Math.abs(article.difficulty - result.difficulty) > 1) {
      signals.push("difficulty_mismatch");
    }
  }

  if (signals.length === 0) return null;

  return {
    article_id: article.id,
    topic_key: article.topic_key,
    title: article.title,
    language: article.language,
    raz_level: article.raz_level,
    signals,
    metrics: {
      attempts,
      avg_accuracy: avgAccuracy,
      llm_difficulty:
        typeof article.difficulty === "number" ? article.difficulty : null,
      calc_difficulty: calcDifficulty,
      indicators,
    },
    recommendation: decideRecommendation(signals),
  };
}

function signalsToIssueCodes(signals: SignalCode[]): string[] {
  const codes: string[] = [];
  if (signals.includes("accuracy_drift")) codes.push(ISSUE_CODE_ACCURACY);
  if (signals.includes("difficulty_mismatch")) codes.push(ISSUE_CODE_MISMATCH);
  return codes;
}

// ---------------------------------------------------------------------------
// Persistence (--execute only)
// ---------------------------------------------------------------------------

async function persistQualityIssues(
  supabase: SupabaseClient,
  article: ArticleRow,
  flagged: FlaggedArticle
): Promise<void> {
  const merged = mergeIssueCodes(
    article.quality_issues,
    signalsToIssueCodes(flagged.signals)
  );
  // Idempotency: if the merged set equals the existing set, skip the write.
  const existing = normalizeIssueArray(article.quality_issues).slice().sort();
  if (
    existing.length === merged.length &&
    existing.every((v, i) => v === merged[i])
  ) {
    return;
  }

  const { error } = await supabase
    .from("reading_articles")
    .update({ quality_issues: merged } as never)
    .eq("id", article.id);

  if (error) {
    throw new Error(`UPDATE quality_issues failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Run modes
// ---------------------------------------------------------------------------

function buildSummary(
  flagged: FlaggedArticle[],
  errorCount: number
): DriftReport["summary"] {
  let acc = 0;
  let mis = 0;
  let both = 0;
  let regenerate = 0;
  let tagOnly = 0;
  let review = 0;
  for (const f of flagged) {
    const hasA = f.signals.includes("accuracy_drift");
    const hasM = f.signals.includes("difficulty_mismatch");
    if (hasA) acc++;
    if (hasM) mis++;
    if (hasA && hasM) both++;
    if (f.recommendation === "regenerate") regenerate++;
    else if (f.recommendation === "tag_only") tagOnly++;
    else review++;
  }
  return {
    flagged_total: flagged.length,
    accuracy_drift: acc,
    difficulty_mismatch: mis,
    both,
    regenerate,
    tag_only: tagOnly,
    review,
    errors: errorCount,
  };
}

async function runScan(
  supabase: SupabaseClient,
  opts: RunOptions
): Promise<DriftReport> {
  const minAttempts = getMinAttempts();
  const accuracyThreshold = getAccuracyThreshold();
  const limit = getLimit();

  console.log("=== Detect Article Drift ===");
  console.log(`Mode:                ${opts.execute ? "execute" : "dry-run"}`);
  console.log(`Min attempts:        ${minAttempts} (DRIFT_MIN_ATTEMPTS)`);
  console.log(`Accuracy threshold:  ${accuracyThreshold} (DRIFT_ACCURACY_THRESHOLD)`);
  console.log(`Limit:               ${limit > 0 ? limit : "no limit"} (DRIFT_LIMIT)`);
  console.log("");

  const articles = await loadPublishedArticles(supabase, limit);
  console.log(`Total published articles scanned: ${articles.length}`);

  const accuracyByArticle = await loadAccuracyByArticle(
    supabase,
    articles.map((a) => a.id)
  );
  console.log(`Articles with quiz attempts:      ${accuracyByArticle.size}`);
  console.log("");

  const ctx: EvalContext = { minAttempts, accuracyThreshold, accuracyByArticle };
  const flagged: FlaggedArticle[] = [];
  let errorCount = 0;

  for (const article of articles) {
    try {
      const result = evaluateArticle(article, ctx);
      if (!result) continue;
      flagged.push(result);

      if (opts.execute) {
        try {
          await persistQualityIssues(supabase, article, result);
          console.log(
            `[tagged] ${article.id} ${result.signals.join(",")} -> ${result.recommendation}`
          );
        } catch (err) {
          // Per-article persistence failure is isolated.
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[fail-tag] ${article.id} — ${msg}`);
          errorCount++;
        }
      } else {
        console.log(
          `  - ${article.id} "${article.title}" signals=${result.signals.join(",")} ` +
            `attempts=${result.metrics.attempts} acc=${result.metrics.avg_accuracy ?? "n/a"} ` +
            `llm=${result.metrics.llm_difficulty ?? "n/a"} calc=${result.metrics.calc_difficulty ?? "n/a"} ` +
            `-> ${result.recommendation}`
        );
      }
    } catch (err) {
      // Per-article evaluation failure is isolated and never aborts the batch.
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[fail-eval] ${article.id} — ${msg}`);
      errorCount++;
    }
  }

  return {
    ranAt: new Date().toISOString(),
    totalArticles: articles.length,
    flagged,
    summary: buildSummary(flagged, errorCount),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  validateEnv();

  const supabase = await createServiceRoleClient();
  const report = await runScan(supabase, opts);

  console.log("");
  console.log("=== SUMMARY ===");
  console.log(`Total articles:        ${report.totalArticles}`);
  console.log(`Flagged total:         ${report.summary.flagged_total}`);
  console.log(`  accuracy_drift:      ${report.summary.accuracy_drift}`);
  console.log(`  difficulty_mismatch: ${report.summary.difficulty_mismatch}`);
  console.log(`  both signals:        ${report.summary.both}`);
  console.log(`  -> regenerate:       ${report.summary.regenerate}`);
  console.log(`  -> tag_only:         ${report.summary.tag_only}`);
  console.log(`  -> review:           ${report.summary.review}`);
  console.log(`Errors (per-article):  ${report.summary.errors}`);

  if (opts.execute) {
    const ts = report.ranAt.replace(/[:.]/g, "-");
    const path = `/tmp/drift-report-${ts}.json`;
    try {
      writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
      console.log(`Report written:        ${path}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`Report write failed:   ${msg}`);
    }
  } else {
    // dry-run: emit the JSON to stdout so callers can pipe / capture it.
    console.log("");
    console.log("=== JSON REPORT (dry-run) ===");
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("\nFatal error:", message);
  if ((err as Error & { code?: string }).code === "ERR_MISSING_ENV") {
    console.error(
      "(Expected when environment is not configured — this is not a code error.)"
    );
  }
  process.exit(1);
});
