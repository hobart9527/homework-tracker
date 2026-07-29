#!/usr/bin/env node

/**
 * Retry Draft Articles Script
 *
 * Reads draft articles from reading_articles, re-generates content via
 * generateReadingContent (route C), re-runs quality gates, and publishes
 * articles that pass. Articles that still fail are logged and skipped.
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL  (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *   OPENAI_API_KEY            (required)
 *
 * Usage:
 *   npx tsx scripts/retry-draft-articles.ts
 *   npx tsx scripts/retry-draft-articles.ts --limit=20
 *   npx tsx scripts/retry-draft-articles.ts --language=zh
 *   npx tsx scripts/retry-draft-articles.ts --dry-run
 *   npx tsx scripts/retry-draft-articles.ts --limit=10 --language=en --dry-run
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const requiredEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

// Dynamic imports — reading modules initialize OpenAI client at module load time.
const readingMod = await import("@/lib/reading");
const supabaseMod = await import("@/lib/supabase/server");

const generateReadingContent = readingMod.generateReadingContent;
const validateContent = readingMod.validateContent;
const validateIBCriteria = readingMod.validateIBCriteria;

const createServiceRoleClient = supabaseMod.createServiceRoleClient;

interface DraftArticle {
  id: string;
  topic_key: string;
  title: string;
  grade_level: number;
  language: string;
  category: string;
  quality_issues: any;
}

interface TopicRow {
  topic_key: string;
  category: string;
  source: string | null;
  source_text: string | null;
  source_url: string | null;
  source_image_url: string | null;
  key_facts: string[] | null;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 50;
  const dryRun = args.includes("--dry-run");
  const langArg = args.find((a) => a.startsWith("--language="));
  const language = langArg ? langArg.split("=")[1] : undefined;

  const supabase = await createServiceRoleClient();

  // Query draft articles
  let query = supabase
    .from("reading_articles")
    .select("id, topic_key, title, grade_level, language, category, quality_issues")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (language) {
    query = query.eq("language", language);
  }

  const { data: drafts, error } = await query;
  if (error) {
    throw new Error(`Failed to load drafts: ${error.message}`);
  }

  console.log(`Found ${drafts?.length || 0} draft articles to retry\n`);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const draft of (drafts || []) as DraftArticle[]) {
    // Load topic
    const { data: topic } = await supabase
      .from("reading_topics")
      .select("topic_key, category, source, source_text, source_url, source_image_url, key_facts")
      .eq("topic_key", draft.topic_key)
      .maybeSingle();

    if (!topic) {
      console.log(`[${draft.topic_key} G${draft.grade_level}] SKIP - topic not found`);
      skipped++;
      continue;
    }

    const topicRow = topic as TopicRow;

    try {
      // Re-generate content using route C (full generation)
      const result = await generateReadingContent({
        topicKey: draft.topic_key,
        language: draft.language as "zh" | "en",
        category: draft.category,
        schoolGrade: draft.grade_level,
        sourceText: topicRow.source_text || undefined,
        route: "C",
      });

      // Re-run quality gates
      const gate = validateContent({
        article: result.article,
        questions: result.questions,
        language: draft.language as "zh" | "en",
        gradeLevel: draft.grade_level,
      });

      const ibGate = validateIBCriteria({
        article: result.article,
        questions: result.questions,
        language: draft.language as "zh" | "en",
        gradeLevel: draft.grade_level,
      });

      const qualityPass = gate.pass && ibGate.pass;

      if (qualityPass) {
        if (!dryRun) {
          // Update article with new content and published status
          await supabase
            .from("reading_articles")
            .update({
              title: result.article.title,
              content: result.article.content,
              summary: result.article.summary,
              word_count: result.article.word_count,
              estimated_minutes: result.article.estimated_minutes,
              difficulty: result.article.difficulty,
              scene_description: result.article.scene_description,
              status: "published",
              quality_issues: null,
            })
            .eq("id", draft.id);

          // Replace questions
          await supabase.from("reading_questions").delete().eq("article_id", draft.id);
          if (result.questions.length > 0) {
            await supabase.from("reading_questions").insert(
              result.questions.map((q: any, i: number) => ({
                article_id: draft.id,
                question_text: q.question_text,
                question_type: q.question_type,
                options: q.options,
                correct_answer: q.correct_answer,
                difficulty: q.difficulty,
                order_index: i + 1,
              }))
            );
          }
        }

        console.log(
          `[${draft.topic_key} G${draft.grade_level}] ${dryRun ? "WOULD PUBLISH" : "PUBLISHED"} - "${result.article.title}"`
        );
        succeeded++;
      } else {
        const allIssues = [...gate.issues, ...ibGate.issues];
        const errors = allIssues.filter((i: any) => i.severity === "error");
        console.log(
          `[${draft.topic_key} G${draft.grade_level}] STILL FAILS - ${errors.map((i: any) => i.code).join(", ")}`
        );
        failed++;
      }
    } catch (err) {
      console.error(
        `[${draft.topic_key} G${draft.grade_level}] ERROR - ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  console.log(`\n=== RETRY DRAFT COMPLETE ===`);
  console.log(`Total: ${drafts?.length || 0}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
