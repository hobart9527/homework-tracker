#!/usr/bin/env npx tsx

/**
 * Backfill Chinese reading_articles word_count + re-validate quality gates.
 *
 * 1. Recompute actual Chinese character count for all zh articles.
 * 2. Update word_count field.
 * 3. Re-evaluate against reading-standards.json ranges.
 * 4. Demote published articles with deviation > 0.3 to draft.
 * 5. Record quality_issues for out-of-range articles.
 *
 * Usage:
 *   npx tsx scripts/reading/backfill-chinese-wordcount.ts [--dry-run]
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getWordCountRange } from "../../src/lib/reading/standards";

config({ path: ".env.local" });

const CHINESE_CHAR_RE = /[一-鿿]/g;

function countChineseChars(content: string): number {
  if (!content) return 0;
  return (content.match(CHINESE_CHAR_RE) || []).length;
}

function rangeDeviation(actual: number, range: { min: number; max: number }): number {
  if (actual >= range.min && actual <= range.max) return 0;
  if (actual < range.min) return (range.min - actual) / range.min;
  return (actual - range.max) / range.max;
}

interface ArticleRow {
  id: string;
  topic_key: string;
  grade_level: number;
  content: string;
  word_count: number | null;
  status: string;
  quality_issues: string[] | null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`=== Chinese Word Count Backfill ${dryRun ? "[DRY-RUN]" : ""} ===\n`);

  const { data: articles, error } = await sb
    .from("reading_articles")
    .select("id, topic_key, grade_level, content, word_count, status, quality_issues")
    .eq("language", "zh");

  if (error) {
    console.error("Fetch failed:", error.message);
    process.exit(1);
  }

  if (!articles || articles.length === 0) {
    console.log("No Chinese articles found.");
    return;
  }

  console.log(`Found ${articles.length} Chinese articles.\n`);

  let updated = 0;
  let demoted = 0;
  let unchanged = 0;
  const details: string[] = [];

  for (const article of articles as ArticleRow[]) {
    const actualChars = countChineseChars(article.content);
    const dbWordCount = article.word_count ?? 0;
    const range = getWordCountRange("zh", article.grade_level);
    const dev = rangeDeviation(actualChars, range);

    const severity = dev <= 0.2 ? "ok" : dev > 0.3 ? "error" : "warn";
    const needsWordCountUpdate = actualChars !== dbWordCount;

    const issueMessage = `Article has ${actualChars} Chinese characters; expected ${range.min}-${range.max} for grade ${article.grade_level} zh (deviation ${(dev * 100).toFixed(0)}%).`;

    const needsStatusUpdate = severity === "error" && article.status === "published";
    const newStatus = needsStatusUpdate ? "draft" : article.status;

    let newQualityIssues: string[] | null = null;
    if (severity === "error" || severity === "warn") {
      newQualityIssues = [issueMessage];
    }

    const changed = needsWordCountUpdate || needsStatusUpdate || newQualityIssues !== null;

    if (changed) {
      if (dryRun) {
        details.push(
          `[DRY-RUN] ${article.topic_key} G${article.grade_level}: word_count ${dbWordCount} -> ${actualChars}, status ${article.status}${needsStatusUpdate ? " -> draft" : ""}, severity=${severity}`
        );
      } else {
        const { error: updateError } = await sb
          .from("reading_articles")
          .update({
            word_count: actualChars,
            status: newStatus,
            quality_issues: newQualityIssues,
          })
          .eq("id", article.id);

        if (updateError) {
          console.error(`  Update failed for ${article.topic_key}: ${updateError.message}`);
          continue;
        }
        updated++;
        if (needsStatusUpdate) demoted++;
        details.push(
          `${article.topic_key} G${article.grade_level}: word_count ${dbWordCount} -> ${actualChars}, status ${article.status}${needsStatusUpdate ? " -> draft" : ""}, severity=${severity}`
        );
      }
    } else {
      unchanged++;
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total articles: ${articles.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Demoted to draft: ${demoted}`);
  console.log(`Unchanged: ${unchanged}`);

  if (details.length > 0) {
    console.log("\n=== DETAILS ===");
    for (const d of details) console.log(d);
  }
}

main().catch(console.error);
