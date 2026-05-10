#!/usr/bin/env node

/**
 * Reading Content Pipeline Script (TypeScript)
 *
 * Standalone cron-compatible pipeline for generating English reading content.
 * Reads topics from the reading_topics table, generates content via OpenAI,
 * produces cover images and in-article illustrations, runs quality gate,
 * and stores results in Supabase. Does NOT require Next.js runtime.
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL  (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *   OPENAI_API_KEY            (required)
 *   OPENAI_BASE_URL           (optional, default: https://api.openai.com/v1)
 *   OPENAI_READING_MODEL      (optional, default: gpt-4o-mini)
 *   PIPELINE_GRADES           (optional, default: "3,6")
 *   PIPELINE_TOPIC_LIMIT      (optional, default: 0 = all topics)
 *   MINIMAX_DAILY_QUOTA       (optional, default: 50)
 *
 * Usage:
 *   npx tsx scripts/reading-content-pipeline.ts
 *   PIPELINE_GRADES="3,4,5" PIPELINE_TOPIC_LIMIT=2 npx tsx scripts/reading-content-pipeline.ts
 *
 * Exit codes:
 *   0 - all succeeded or partially skipped (no failures)
 *   1 - one or more articles failed
 */

import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

// Validate env BEFORE any dynamic imports that may initialize external clients.
validateEnv();

// Dynamic imports are REQUIRED because content-generator.ts initializes its
// OpenAI client at module load time (needs OPENAI_API_KEY). Static imports
// would run before dotenv loads, causing an empty API key.
const readingMod = await import("@/lib/reading");
const supabaseMod = await import("@/lib/supabase/server");
const concurrencyMod = await import("@/lib/reading/concurrency");

const generateReadingContent = readingMod.generateReadingContent;
const generateCover = readingMod.generateCover;
const generateIllustrations = readingMod.generateIllustrations;
const validateContent = readingMod.validateContent;
const createServiceRoleClient = supabaseMod.createServiceRoleClient;
const Pacer = concurrencyMod.Pacer;
const withRetry = concurrencyMod.withRetry;

// Local type definitions for tables not yet in the generated Database types.
// These match the frozen schema in .planning/reading-pipeline-task-plan.md §3.1 and §3.2.
interface ReadingTopicRow {
  topic_key: string;
  category: string;
  source_text: string | null;
  source_url: string | null;
  target_grades: number[] | null;
}

interface ReadingArticleRow {
  id: string;
  topic_key: string;
  title: string;
  content: string;
  source: string;
  source_url: string | null;
  category: string;
  grade_level: number;
  word_count: number;
  estimated_minutes: number;
  difficulty: number;
  status: string;
  created_at: string;
}

// Minimal Database shape for type-safe Supabase client usage in this script.
interface PipelineDatabase {
  public: {
    Tables: {
      reading_articles: {
        Row: ReadingArticleRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      reading_questions: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      reading_article_illustrations: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      reading_topics: {
        Row: ReadingTopicRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
  };
}

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function validateEnv(): void {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
  ];

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

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function getSupabaseClient(): Promise<SupabaseClient> {
  return createServiceRoleClient();
}

interface ExistingArticleCheck {
  exists: boolean;
  id: string | null;
  status: string | null;
}

async function checkExistingArticle(
  supabase: SupabaseClient<PipelineDatabase>,
  topicKey: string,
  gradeLevel: number
): Promise<ExistingArticleCheck> {
  const { data, error } = await supabase
    .from("reading_articles")
    .select("id, status")
    .eq("topic_key", topicKey)
    .eq("grade_level", gradeLevel)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check existing article: ${error.message}`);
  }

  const row = data as { id?: string; status?: string } | null;

  return {
    exists: !!row,
    id: row?.id ?? null,
    status: row?.status ?? null,
  };
}

interface UpsertArticleData {
  topicKey: string;
  gradeLevel: number;
  title: string;
  content: string;
  sourceUrl: string | null;
  category: string;
  wordCount: number;
  estimatedMinutes: number;
  difficulty: number;
  sceneDescription: string;
  summary: string;
  status: "draft" | "published";
  coverImageUrl: string | null;
  coverSource: string | null;
  coverSourceUrl: string | null;
  qualityIssues: unknown[] | null;
}

async function upsertArticle(
  supabase: SupabaseClient<PipelineDatabase>,
  articleData: UpsertArticleData
): Promise<string> {
  const { data, error } = await (supabase as SupabaseClient)
    .from("reading_articles")
    .upsert(
      {
        topic_key: articleData.topicKey,
        grade_level: articleData.gradeLevel,
        title: articleData.title,
        content: articleData.content,
        source: "curated_news",
        source_url: articleData.sourceUrl,
        category: articleData.category,
        word_count: articleData.wordCount,
        estimated_minutes: articleData.estimatedMinutes,
        difficulty: articleData.difficulty,
        scene_description: articleData.sceneDescription,
        summary: articleData.summary,
        status: articleData.status,
        cover_image_url: articleData.coverImageUrl,
        cover_source: articleData.coverSource,
        cover_source_url: articleData.coverSourceUrl,
        quality_issues: articleData.qualityIssues,
      },
      { onConflict: "topic_key, grade_level" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to upsert article: ${error.message}`);
  }

  const upserted = data as { id?: string } | null;
  if (!upserted?.id) {
    throw new Error("Upsert succeeded but no article ID was returned.");
  }

  return upserted.id;
}

interface QuestionData {
  question_text: string;
  question_type: string;
  options: { label: string; text: string }[];
  correct_answer: string;
  difficulty: number;
}

async function replaceQuestions(
  supabase: SupabaseClient<PipelineDatabase>,
  articleId: string,
  questions: QuestionData[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("reading_questions")
    .delete()
    .eq("article_id", articleId);

  if (deleteError) {
    throw new Error(`Failed to delete old questions: ${deleteError.message}`);
  }

  if (!questions || questions.length === 0) return;

  const { error: insertError } = await (supabase as SupabaseClient)
    .from("reading_questions")
    .insert(
      questions.map((q, i) => ({
        article_id: articleId,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        correct_answer: q.correct_answer,
        difficulty: q.difficulty || 3,
        order_index: i + 1,
      }))
    );

  if (insertError) {
    throw new Error(`Failed to insert questions: ${insertError.message}`);
  }
}

interface IllustrationData {
  paragraph_index: number;
  image_url: string;
  source_url: string;
  source: string;
  scene_description: string;
}

async function replaceIllustrations(
  supabase: SupabaseClient<PipelineDatabase>,
  articleId: string,
  illustrations: IllustrationData[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("reading_article_illustrations")
    .delete()
    .eq("article_id", articleId);

  if (deleteError) {
    throw new Error(`Failed to delete old illustrations: ${deleteError.message}`);
  }

  if (!illustrations || illustrations.length === 0) return;

  const { error: insertError } = await (supabase as SupabaseClient)
    .from("reading_article_illustrations")
    .insert(
      illustrations.map((ill) => ({
        article_id: articleId,
        paragraph_index: ill.paragraph_index,
        image_url: ill.image_url,
        source_url: ill.source_url,
        source: ill.source,
        scene_description: ill.scene_description,
      }))
    );

  if (insertError) {
    throw new Error(`Failed to insert illustrations: ${insertError.message}`);
  }
}

// ---------------------------------------------------------------------------
// Topic loader
// ---------------------------------------------------------------------------

async function loadTopics(
  supabase: SupabaseClient<PipelineDatabase>,
  limit: number
): Promise<ReadingTopicRow[]> {
  let query = supabase
    .from("reading_topics")
    .select("topic_key, category, source_text, source_url, target_grades")
    .eq("language", "en")
    .eq("status", "active");

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load topics: ${error.message}`);
  }

  return (data || []) as ReadingTopicRow[];
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

interface WorkItem {
  topic: ReadingTopicRow;
  grade: number;
}

async function main(): Promise<void> {
  console.log("=== Reading Content Pipeline ===\n");

  // Validate environment
  validateEnv();

  // Parse config
  const grades = (process.env.PIPELINE_GRADES || "3,6")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  const topicLimit = parseInt(process.env.PIPELINE_TOPIC_LIMIT || "0", 10);

  if (grades.length === 0) {
    console.error("ERROR: No valid grade levels configured.");
    process.exit(1);
  }

  console.log(`Grades:     ${grades.join(", ")}`);
  console.log(`Model:      ${process.env.OPENAI_READING_MODEL || "gpt-4o-mini"}`);
  console.log(`Base URL:   ${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}`);
  console.log("");

  const supabase = await getSupabaseClient();

  // Load topics from database
  const topics = await loadTopics(supabase, topicLimit);
  console.log(`Topics:     ${topics.length} (${topicLimit > 0 ? `limited to ${topicLimit}` : "all"})`);
  console.log("");

  if (topics.length === 0) {
    console.warn("WARNING: No active English topics found in reading_topics table.");
  }

  // Collect all work items (topic, grade) pairs
  const workItems: WorkItem[] = [];
  for (const grade of grades) {
    for (const topic of topics) {
      workItems.push({ topic, grade });
    }
  }

  // Create pacer for concurrent LLM/generation calls
  const pacer = new Pacer(3);

  let total = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  // Process all work items through the pacer
  const tasks = workItems.map((item, index) =>
    processWorkItem(item, index + 1, workItems.length, grades, topics, supabase)
  );

  const results = await Promise.all(tasks);

  for (const result of results) {
    total++;
    if (result.status === "succeeded") succeeded++;
    else if (result.status === "skipped") skipped++;
    else if (result.status === "failed") failed++;
  }

  console.log("\n=== PIPELINE COMPLETE ===");
  console.log(`Total:     ${total}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

type WorkItemStatus = "succeeded" | "skipped" | "failed";

interface ProcessResult {
  status: WorkItemStatus;
}

async function processWorkItem(
  item: WorkItem,
  index: number,
  total: number,
  grades: number[],
  topics: ReadingTopicRow[],
  supabase: SupabaseClient<PipelineDatabase>
): Promise<ProcessResult> {
  const pacer = new Pacer(3);
  const { topic, grade } = item;
  const key = `${topic.topic_key}|G${grade}`;
  process.stdout.write(
    `[${index}/${total}] ${key} (${topic.category})... `
  );

  try {
    // Determine which grades to process for this topic
    const targetGrades =
      topic.target_grades && topic.target_grades.length > 0
        ? topic.target_grades.filter((g) => grades.includes(g))
        : [grade];

    // If this grade is not in the topic's target_grades, skip it
    if (topic.target_grades && topic.target_grades.length > 0 && !targetGrades.includes(grade)) {
      console.log("SKIP (grade not in target_grades)");
      return { status: "skipped" };
    }

    // Step 1: Check if article already exists and is published
    const existing = await checkExistingArticle(
      supabase,
      topic.topic_key,
      grade
    );

    if (existing.exists && existing.status === "published") {
      console.log("SKIP (already published)");
      return { status: "skipped" };
    }

    // Step 2: Generate article content (concurrent, with retry)
    const contentResult = await pacer.run(() =>
      withRetry(() =>
        generateReadingContent({
          topicKey: topic.topic_key,
          language: "en",
          category: topic.category,
          gradeLevel: grade,
          sourceText: topic.source_text || undefined,
        })
      )
    );

    const { article, questions, illustrations } = contentResult;

    // Step 3: Run quality gate
    const gate = validateContent({
      article,
      questions,
      language: "en",
      gradeLevel: grade,
    });

    const status: "draft" | "published" = gate.pass ? "published" : "draft";

    // Step 4: Generate cover image (concurrent, with retry)
    let coverResult: { url: string; source: string; source_url: string } | null = null;
    try {
      coverResult = await pacer.run(() =>
        withRetry(() =>
          generateCover({
            articleId: existing.id || "pending",
            language: "en",
            category: topic.category,
            scene: article.scene_description,
            title: article.title,
          })
        )
      );
    } catch (coverErr) {
      const reason = coverErr instanceof Error ? coverErr.message : String(coverErr);
      console.warn(`\n  [cover] failed: ${reason}`);
    }

    // Step 5: Generate in-article illustrations (concurrent, with retry)
    let illustrationResults: { paragraph_index: number; url: string; source_url: string; source: string }[] = [];
    try {
      illustrationResults = await pacer.run(() =>
        withRetry(() =>
          generateIllustrations({
            articleId: existing.id || "pending",
            language: "en",
            category: topic.category,
            scenes: illustrations.map((ill: { paragraph_index: number; scene_description: string }) => ({
              paragraphIndex: ill.paragraph_index,
              sceneDescription: ill.scene_description,
            })),
          })
        )
      );
    } catch (illErr) {
      const reason = illErr instanceof Error ? illErr.message : String(illErr);
      console.warn(`\n  [illustrations] failed: ${reason}`);
    }

    // Step 6: Upsert article with all metadata (DB operation, outside pacer)
    const articleId = await upsertArticle(supabase, {
      topicKey: topic.topic_key,
      gradeLevel: grade,
      title: article.title,
      content: article.content,
      sourceUrl: topic.source_url,
      category: topic.category,
      wordCount: article.word_count,
      estimatedMinutes: article.estimated_minutes,
      difficulty: article.difficulty,
      sceneDescription: article.scene_description,
      summary: article.summary,
      status,
      coverImageUrl: coverResult?.url ?? null,
      coverSource: coverResult?.source ?? null,
      coverSourceUrl: coverResult?.source_url ?? null,
      qualityIssues: gate.issues.length > 0 ? gate.issues : null,
    });

    // Step 7: Replace questions (DB operation, outside pacer)
    await replaceQuestions(supabase, articleId, questions);

    // Step 8: Replace illustrations (DB operation, outside pacer)
    await replaceIllustrations(
      supabase,
      articleId,
      illustrationResults.map((ill) => ({
        paragraph_index: ill.paragraph_index,
        image_url: ill.url,
        source_url: ill.source_url,
        source: ill.source,
        scene_description:
          illustrations.find((i: { paragraph_index: number; scene_description: string }) => i.paragraph_index === ill.paragraph_index)
            ?.scene_description || "",
      }))
    );

    const gateLabel = gate.pass ? "published" : "draft";
    console.log(
      `OK — "${article.title}" (${questions.length} questions, ${illustrationResults.length} illustrations, ${gateLabel})`
    );
    return { status: "succeeded" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`FAIL — ${message}`);
    return { status: "failed" };
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