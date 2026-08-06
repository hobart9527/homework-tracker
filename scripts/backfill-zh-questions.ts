#!/usr/bin/env node

/**
 * Backfill questions for published zh articles with zero questions.
 *
 * For each orphan article, prompts the LLM to generate questions only
 * (using the same regenerateQuestionsOnly logic as the main pipeline).
 * Questions are normalized via coerceQuestionType and inserted directly.
 *
 * Usage:
 *   npx tsx scripts/backfill-zh-questions.ts
 *   npx tsx scripts/backfill-zh-questions.ts --limit=10
 *   npx tsx scripts/backfill-zh-questions.ts --dry-run
 *   npx tsx scripts/backfill-zh-questions.ts --article-id=<uuid>
 */

import { config } from "dotenv";
import { coerceQuestionType } from "@/lib/reading/standards";

config({ path: ".env.local" });

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MINIMAX_API_KEY",
];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required env: ${missing.join(", ")}`);
  process.exit(1);
}

const readingMod = await import("@/lib/reading");
const supabaseMod = await import("@/lib/supabase/server");

const { regenerateQuestionsOnly } = readingMod;
const { validateIBCriteria } = readingMod;
const { createServiceRoleClient } = supabaseMod;

// ──────────────── helpers ────────────────

function normalizeQuestionOptions(q: Record<string, unknown>): { label: string; text: string }[] {
  const raw = q.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => o !== null && typeof o === "object")
    .map((o) => ({
      label: String(o.label || "").trim(),
      text: String(o.text || "").trim(),
    }))
    .filter((o) => o.label || o.text);
}

/** Coerce correct_answer so it matches one of the option labels. */
function fixCorrectAnswer(correctAnswer: unknown, options: { label: string }[]): string {
  const ca = String(correctAnswer || "").trim().toUpperCase();
  const validLabels = new Set(options.map((o) => o.label));
  if (validLabels.has(ca)) return ca;
  // Fallback: first option
  return options[0]?.label || "A";
}

/** Coerce difficulty to 1-5 integer. */
function coerceDifficulty(d: unknown): number {
  const n = Number(d);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n);
  return 3;
}

// ──────────────── main ────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
  const dryRun = args.includes("--dry-run");
  const singleId = args.find((a) => a.startsWith("--article-id="));

  const supabase = await createServiceRoleClient();

  // Fetch orphan articles
  // First get IDs of articles with zero questions
  // (can't do subquery easily, so fetch all zh articles then filter)
  let query = supabase
    .from("reading_articles")
    .select("id, topic_key, title, content, summary, grade_level, category, genre, cultural_connection, word_count, estimated_minutes, difficulty, scene_description")
    .eq("language", "zh")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (singleId) {
    query = supabase
      .from("reading_articles")
      .select("id, topic_key, title, content, summary, grade_level, category, genre, cultural_connection, word_count, estimated_minutes, difficulty, scene_description")
      .eq("id", singleId.split("=")[1]);
  }

  const { data: orphans, error } = await query;
  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  // Filter to those with zero questions
  const articleIds = orphans.map((a: any) => a.id);
  if (articleIds.length === 0) {
    console.log("No orphan articles found.");
    return;
  }

  // Batch count questions per article
  const { data: qCounts, error: qErr } = await supabase
    .from("reading_questions")
    .select("article_id")
    .in("article_id", articleIds);

  if (qErr) {
    console.error("Question count query failed:", qErr.message);
    process.exit(1);
  }

  const hasQuestions = new Set((qCounts || []).map((r: any) => r.article_id));
  const targetArticles = orphans
    .filter((a: any) => !hasQuestions.has(a.id))
    .slice(0, limit);

  if (targetArticles.length === 0) {
    console.log("All fetched articles already have questions.");
    return;
  }

  console.log(`\nTarget: ${targetArticles.length} zh articles (dryRun=${dryRun})\n`);

  let successCount = 0;
  let failCount = 0;

  for (const article of targetArticles) {
    const { id, topic_key, title, content, summary, grade_level, category, genre, word_count, estimated_minutes, difficulty, scene_description, cultural_connection } = article;

    console.log(`\n[${successCount + failCount + 1}/${targetArticles.length}] G${grade_level}: ${title}`);

    // Build minimal GeneratedArticle for regenerateQuestionsOnly
    const articlePayload = {
      title,
      content,
      summary: summary || content.slice(0, 200),
      word_count: word_count || content.length,
      estimated_minutes: estimated_minutes || Math.max(1, Math.round((word_count || content.length) / 80)),
      difficulty: difficulty || Math.min(5, grade_level),
      scene_description: scene_description || summary?.slice(0, 100) || content.slice(0, 100),
      genre: (genre as any) || "记叙文",
      cultural_connection: cultural_connection || undefined,
    };

    // Determine question count from grade level
    const qCounts: Record<number, number> = { 3: 8, 4: 8, 5: 8, 6: 6, 7: 6 };
    const questionCount = qCounts[grade_level] || 6;

    try {
      // Call regenerateQuestionsOnly (no LLM article generation needed)
      const questions = await regenerateQuestionsOnly(
        articlePayload,
        grade_level,
        "zh",
        { category, topicKey: topic_key }
      );

      if (!questions || questions.length === 0) {
        console.warn(`  No questions returned, skipping`);
        failCount++;
        continue;
      }

      // Validate with IB criteria gate
      const ibResult = validateIBCriteria({
        article: articlePayload as any,
        questions: questions as any,
        language: "zh",
        gradeLevel: grade_level,
      });

      // If IB fails on error-level, log issues but still insert (info-level only)
      if (!ibResult.pass) {
        const errors = ibResult.issues.filter((i) => i.severity === "error");
        if (errors.length > 0) {
          console.warn(`  IB issues: ${errors.map((e) => e.code).join(", ")}`);
        }
      }

      // Normalize questions
      const normalized = questions.map((q: any, i: number) => {
        const options = normalizeQuestionOptions(q);
        const coerceOptions = options.length >= 4 ? options : [
          { label: "A", text: "选项A" },
          { label: "B", text: "选项B" },
          { label: "C", text: "选项C" },
          { label: "D", text: "选项D" },
        ];
        return {
          article_id: id,
          question_text: q.question_text,
          question_type: coerceQuestionType(q.question_type),
          options: coerceOptions,
          correct_answer: fixCorrectAnswer(q.correct_answer, coerceOptions),
          difficulty: coerceDifficulty(q.difficulty),
          order_index: i,
        };
      });

      if (dryRun) {
        console.log(`  Would insert ${normalized.length} questions`);
        normalized.slice(0, 2).forEach((q: any, i: number) => {
          console.log(`    [${i}] ${q.question_type}: ${q.question_text.slice(0, 60)}`);
        });
        successCount++;
        continue;
      }

      // Delete any stale questions for this article, then insert
      await supabase.from("reading_questions").delete().eq("article_id", id);
      const { error: insertError } = await supabase
        .from("reading_questions")
        .insert(normalized);

      if (insertError) {
        console.error(`  FAILED insert: ${insertError.message}`);
        failCount++;
      } else {
        console.log(`  OK: inserted ${normalized.length} questions`);
        successCount++;
      }
    } catch (e: any) {
      console.error(`  ERROR: ${e.message?.slice(0, 120) || e}`);
      failCount++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${successCount}, Failed: ${failCount}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});