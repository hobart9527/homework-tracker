#!/usr/bin/env node
/**
 * Regenerate Flagged Reading Articles (W3-T3)
 *
 * Reads a drift-detection report (produced by W3-T1) and re-runs
 * generateReadingContent for each flagged article whose recommendation is
 * "regenerate". Replaces the article's content + questions while preserving
 * the existing article id, topic_key, language, source_url, etc. Cover images
 * and illustrations are intentionally NOT regenerated (out of scope).
 *
 * The script is idempotent (running twice with the same report yields the
 * same final state) and rate-limited (1500ms between regens).
 *
 * Usage:
 *   npx tsx scripts/regenerate-flagged-articles.ts --dry-run --report-file=/tmp/drift.json
 *   npx tsx scripts/regenerate-flagged-articles.ts --execute --report-file=/tmp/drift.json
 *   npx tsx scripts/regenerate-flagged-articles.ts --execute --report-file=/tmp/drift.json --only-language=zh
 *   npx tsx scripts/regenerate-flagged-articles.ts --execute --report-file=/tmp/drift.json --max=5
 *
 * Flags:
 *   --dry-run                (default) print plan only; no API calls, no DB writes
 *   --execute                actually regenerate
 *   --report-file=<path>     REQUIRED — path to JSON drift report from W3-T1
 *   --only-language=zh|en    optional language filter
 *   --max=<N>                cap total regens per run (default 10)
 *
 * Env (required for --execute):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *
 * Exit codes:
 *   0 — completed (including dry-run)
 *   1 — fatal (missing report-file, unreadable/malformed report, missing env)
 */

import { config } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// CLI parsing (no new npm deps)
// ---------------------------------------------------------------------------

interface RunOptions {
  dryRun: boolean;
  execute: boolean;
  reportFile: string | null;
  onlyLanguage: "zh" | "en" | null;
  max: number;
}

const DEFAULT_MAX = 10;
const RATE_LIMIT_MS = 1500;

function parseArgs(argv: string[]): RunOptions {
  const args = argv.slice(2);
  let execute = false;
  let dryRun = false;
  let reportFile: string | null = null;
  let onlyLanguage: "zh" | "en" | null = null;
  let max = DEFAULT_MAX;

  for (const arg of args) {
    if (arg === "--execute") {
      execute = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--report-file=")) {
      reportFile = arg.slice("--report-file=".length).trim() || null;
    } else if (arg.startsWith("--only-language=")) {
      const v = arg.slice("--only-language=".length).trim().toLowerCase();
      if (v === "zh" || v === "en") {
        onlyLanguage = v;
      } else {
        console.error(`Invalid --only-language=${v} (expected zh|en)`);
        process.exit(1);
      }
    } else if (arg.startsWith("--max=")) {
      const n = parseInt(arg.slice("--max=".length), 10);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --max=${arg.slice("--max=".length)} (expected positive integer)`);
        process.exit(1);
      }
      max = n;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  // Default to dry-run if neither flag is specified.
  if (!execute && !dryRun) {
    dryRun = true;
  }
  // --dry-run wins if both are present? No: --execute is explicit user intent.
  if (execute) {
    dryRun = false;
  }

  return { dryRun, execute, reportFile, onlyLanguage, max };
}

function printUsage(): void {
  console.error(
    [
      "Usage: regenerate-flagged-articles.ts --report-file=<path> [--dry-run | --execute] [--only-language=zh|en] [--max=N]",
      "",
      "  --report-file=<path>   REQUIRED. Path to drift-report JSON from W3-T1.",
      "  --dry-run              (default) Print plan; no API calls.",
      "  --execute              Actually regenerate flagged articles.",
      "  --only-language=zh|en  Filter to a single language.",
      "  --max=N                Cap total regens (default 10).",
    ].join("\n")
  );
}

// ---------------------------------------------------------------------------
// Drift-report types (W3-T1 output)
// ---------------------------------------------------------------------------

type DriftRecommendation = "regenerate" | "review" | "keep" | string;

interface DriftFlaggedEntry {
  article_id?: string;
  id?: string;
  topic_key?: string;
  language?: "zh" | "en" | string;
  recommendation: DriftRecommendation;
  reasons?: string[];
  [key: string]: unknown;
}

interface DriftReport {
  flagged?: DriftFlaggedEntry[];
  [key: string]: unknown;
}

function loadReport(reportFile: string): DriftReport {
  if (!existsSync(reportFile)) {
    console.error(`Drift report not found: ${reportFile}`);
    process.exit(1);
  }
  let raw: string;
  try {
    raw = readFileSync(reportFile, "utf-8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Failed to read drift report: ${reason}`);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Drift report is not valid JSON: ${reason}`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== "object") {
    console.error("Drift report root is not an object.");
    process.exit(1);
  }
  const report = parsed as DriftReport;
  if (!Array.isArray(report.flagged)) {
    console.error('Drift report missing "flagged" array.');
    process.exit(1);
  }
  return report;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a RAZ level string to a numeric grade. Accepts:
 *   "L5"  -> 5
 *   "5"   -> 5
 *   null/undefined/garbage -> fallback (default 5)
 */
function parseRazLevel(raz: string | number | null | undefined, fallback = 5): number {
  if (raz == null) return fallback;
  if (typeof raz === "number") {
    return Number.isFinite(raz) && raz > 0 ? raz : fallback;
  }
  const trimmed = raz.trim();
  if (!trimmed) return fallback;
  const m = /^L?(\d+)$/i.exec(trimmed);
  if (m) {
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  // RAZ alpha-only level (e.g. "aa","C") — best-effort: map to a grade-ish value.
  // We only need a number for prompt sizing; fall back if unparseable.
  return fallback;
}

function validateEnv(): void {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Set these in .env.local before running with --execute.");
    process.exit(1);
  }
}

// Loose row shape for the existing article we read back. We use as-unknown-as
// casts at the query boundary to stay tolerant of generated-types drift
// (per task constraint).
interface ExistingArticleRow {
  id: string;
  topic_key: string;
  language: "zh" | "en" | string;
  category: string;
  raz_level: string | number | null;
  source_text: string | null;
  source_url: string | null;
  recommended_levels: string[] | null;
  title?: string | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface RunSummary {
  planned: number;
  regenerated: number;
  skipped: number;
  failed: number;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  console.log("=== Regenerate Flagged Articles ===");
  console.log(`Mode:           ${opts.execute ? "EXECUTE" : "DRY-RUN"}`);
  console.log(`Report file:    ${opts.reportFile ?? "(none)"}`);
  console.log(`Only language:  ${opts.onlyLanguage ?? "(any)"}`);
  console.log(`Max regens:     ${opts.max}`);
  console.log("");

  if (!opts.reportFile) {
    console.error('ERROR: --report-file=<path> is required.');
    printUsage();
    process.exit(1);
  }

  const report = loadReport(opts.reportFile);
  const flagged = (report.flagged ?? []).filter(
    (f) => f && typeof f === "object" && f.recommendation === "regenerate"
  );

  // Apply optional language filter.
  const filtered = opts.onlyLanguage
    ? flagged.filter((f) => f.language === opts.onlyLanguage)
    : flagged;

  // Cap to --max. Idempotency: process in stable input order.
  const planList = filtered.slice(0, opts.max);

  const summary: RunSummary = {
    planned: planList.length,
    regenerated: 0,
    skipped: 0,
    failed: 0,
  };

  console.log(
    `Flagged total: ${flagged.length}; after language filter: ${filtered.length}; plan: ${planList.length}`
  );
  console.log("");

  if (planList.length === 0) {
    console.log("Nothing to do.");
    printSummary(summary);
    return;
  }

  // Dry-run: print plan and exit before any external clients are initialized.
  if (opts.dryRun) {
    console.log("Plan (dry-run; no API calls, no DB writes):");
    planList.forEach((entry, i) => {
      const id = entry.article_id ?? entry.id ?? "(unknown id)";
      const tk = entry.topic_key ?? "(unknown topic_key)";
      const lang = entry.language ?? "(unknown language)";
      const reasons = Array.isArray(entry.reasons) ? entry.reasons.join(", ") : "";
      console.log(
        `  [${i + 1}/${planList.length}] id=${id} topic_key=${tk} language=${lang}${reasons ? ` reasons=${reasons}` : ""}`
      );
    });
    console.log("");
    printSummary(summary);
    return;
  }

  // Execute mode: validate env, init clients via dynamic import (so dotenv is
  // applied before content-generator's OpenAI client materializes).
  validateEnv();

  const readingMod = await import("@/lib/reading");
  const supabaseMod = await import("@/lib/supabase/server");
  const generateReadingContent = readingMod.generateReadingContent;
  const validateContent = readingMod.validateContent;
  const createServiceRoleClient = supabaseMod.createServiceRoleClient;

  const supabase = (await createServiceRoleClient()) as SupabaseClient;

  for (let i = 0; i < planList.length; i++) {
    const entry = planList[i];
    const reportedId = entry.article_id ?? entry.id ?? null;
    const reportedTopicKey = entry.topic_key ?? null;

    const label = `[${i + 1}/${planList.length}] id=${reportedId ?? "?"} topic_key=${reportedTopicKey ?? "?"}`;

    try {
      if (!reportedId || typeof reportedId !== "string") {
        console.log(`[regen] SKIP ${label} — flagged entry has no usable article id`);
        summary.skipped++;
        continue;
      }

      // 1. Load current article (single source of truth — preserve id/topic_key/source_url).
      const { data: row, error: loadErr } = await supabase
        .from("reading_articles")
        .select(
          "id, topic_key, language, category, raz_level, source_text, source_url, recommended_levels, title"
        )
        .eq("id", reportedId)
        .maybeSingle();

      if (loadErr) {
        console.log(`[regen] FAIL ${label} — load error: ${loadErr.message}`);
        summary.failed++;
        continue;
      }
      if (!row) {
        console.log(`[regen] SKIP ${label} — article not found in DB`);
        summary.skipped++;
        continue;
      }

      const existing = row as unknown as ExistingArticleRow;

      // Apply language filter again at row level (defense-in-depth).
      if (opts.onlyLanguage && existing.language !== opts.onlyLanguage) {
        console.log(`[regen] SKIP ${label} — language=${existing.language} filtered`);
        summary.skipped++;
        continue;
      }

      const lang: "zh" | "en" = existing.language === "zh" ? "zh" : "en";
      const gradeLevel = parseRazLevel(existing.raz_level, 5);

      // 2. Generate new content.
      const { article, questions } = await generateReadingContent({
        topicKey: existing.topic_key,
        language: lang,
        category: existing.category,
        gradeLevel,
        sourceText: existing.source_text ?? undefined,
        recommendedLevels: existing.recommended_levels ?? undefined,
      });

      // 3. Quality gate.
      const gate = validateContent({
        article,
        questions,
        language: lang,
        gradeLevel,
      });
      const status: "draft" | "published" = gate.pass ? "published" : "draft";

      // 4. UPSERT by id (preserves id, topic_key, source_url, language).
      const upsertPayload: Record<string, unknown> = {
        id: existing.id,
        topic_key: existing.topic_key,
        language: existing.language,
        category: existing.category,
        source_url: existing.source_url,
        title: article.title,
        content: article.content,
        summary: article.summary,
        word_count: article.word_count,
        estimated_minutes: article.estimated_minutes,
        difficulty: article.difficulty,
        scene_description: article.scene_description,
        status,
        quality_issues: gate.issues.length > 0 ? gate.issues : null,
      };

      const { error: upsertErr } = await (supabase as SupabaseClient)
        .from("reading_articles")
        .upsert(upsertPayload as never, { onConflict: "id" });

      if (upsertErr) {
        console.log(`[regen] FAIL ${label} — upsert error: ${upsertErr.message}`);
        summary.failed++;
        continue;
      }

      // 5. Replace questions for this article id.
      const { error: deleteErr } = await supabase
        .from("reading_questions")
        .delete()
        .eq("article_id", existing.id);
      if (deleteErr) {
        console.log(
          `[regen] FAIL ${label} — delete-old-questions error: ${deleteErr.message}`
        );
        summary.failed++;
        continue;
      }

      if (questions.length > 0) {
        const insertRows = questions.map((q, idx) => ({
          article_id: existing.id,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options,
          correct_answer: q.correct_answer,
          difficulty: q.difficulty || 3,
          order_index: idx + 1,
        }));
        const { error: insertErr } = await (supabase as SupabaseClient)
          .from("reading_questions")
          .insert(insertRows as never);
        if (insertErr) {
          console.log(
            `[regen] FAIL ${label} — insert-questions error: ${insertErr.message}`
          );
          summary.failed++;
          continue;
        }
      }

      console.log(
        `[regen] ${existing.id} ${article.title} status=${gate.pass ? "pass" : "draft"}`
      );
      summary.regenerated++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`[regen] FAIL ${label} — ${reason}`);
      summary.failed++;
    }

    // Rate-limit between regens (skip after the last one).
    if (i < planList.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
    }
  }

  console.log("");
  printSummary(summary);
}

function printSummary(s: RunSummary): void {
  console.log("=== SUMMARY ===");
  console.log(`Planned:      ${s.planned}`);
  console.log(`Regenerated:  ${s.regenerated}`);
  console.log(`Skipped:      ${s.skipped}`);
  console.log(`Failed:       ${s.failed}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("\nFatal error:", message);
  process.exit(1);
});
