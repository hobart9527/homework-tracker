#!/usr/bin/env node

/**
 * Reading Content Pipeline Script (TypeScript)
 *
 * Standalone cron-compatible pipeline for generating reading content.
 * Reads topics from the reading_topics table, generates content via OpenAI,
 * produces cover images and in-article illustrations, runs quality gate,
 * and stores results in Supabase. Does NOT require Next.js runtime.
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL  (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *   OPENAI_API_KEY            (required)
 *   OPENAI_BASE_URL           (optional, default: https://api.minimaxi.com/v1)
 *   OPENAI_READING_MODEL      (optional, default: MiniMax-M3)
 *   PIPELINE_GRADES           (optional, comma-separated, e.g. "4,7")
 *   PIPELINE_LEVELS           (optional, default: "L1,L2,L3" — used when PIPELINE_GRADES is not set)
 *   PIPELINE_TOPIC_LIMIT      (optional, default: 0 = all topics)
 *   MINIMAX_DAILY_QUOTA       (optional, default: 50)
 *
 * Usage:
 *   npx tsx scripts/reading-content-pipeline.ts
 *   PIPELINE_GRADES="4,7" PIPELINE_TOPIC_LIMIT=2 npx tsx scripts/reading-content-pipeline.ts
 *   npx tsx scripts/reading-content-pipeline.ts --scrape-first
 *
 * Exit codes:
 *   0 - all succeeded or partially skipped (no failures)
 *   1 - one or more articles failed
 */

import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCorpusEntry } from "./reading/classic-corpus";
import scrapeAllSources from "./reading/scrape-all-sources";
import { getWordCountRange, getSyntaxDistribution, gradeHasChapters, getChapterCount } from "@/lib/reading/standards";

config({ path: ".env.local" });

// Grade-driven pipeline: grades take precedence over levels.
type GradeVariant = number; // 1-10 school grade

// Validate env BEFORE any dynamic imports that may initialize external clients.
validateEnv();

// Pipeline language: controls target language for topic loading and content generation.
const pipelineLanguage = (process.env.PIPELINE_LANGUAGE || "en") as "en" | "zh";

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
const validateIBCriteria = readingMod.validateIBCriteria;
const validateFactualAccuracy = readingMod.validateFactualAccuracy;
const createServiceRoleClient = supabaseMod.createServiceRoleClient;
const Pacer = concurrencyMod.Pacer;
const withRetry = concurrencyMod.withRetry;

// Local type definitions for tables not yet in the generated Database types.
// These match the frozen schema in .planning/reading-pipeline-task-plan.md §3.1 and §3.2.
interface ReadingTopicRow {
  topic_key: string;
  category: string;
  source: string | null;
  source_text: string | null;
  source_url: string | null;
  source_image_url: string | null;
  source_inline_image_urls: string[] | null;
  target_grades: number[] | null;
  key_facts: string[] | null;
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
      reading_article_chapters: {
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
// Sanitization helpers — coerce LLM string values to safe integers for DB columns
// ---------------------------------------------------------------------------

function toSafeInt(value: unknown, fallback: number, min?: number, max?: number): number {
  let n: number;
  if (typeof value === "number" && Number.isFinite(value)) {
    n = value;
  } else if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    n = Number.isFinite(parsed) ? parsed : fallback;
  } else {
    n = fallback;
  }
  if (min !== undefined) n = Math.max(min, n);
  if (max !== undefined) n = Math.min(max, n);
  return n;
}

function computeWordCount(content: string, language: string): number {
  if (!content) return 0;
  if (language === "zh") {
    // Count CJK characters as words for Chinese
    const cjk = content.match(/[一-鿿]/g) || [];
    return cjk.length;
  }
  // English: split on whitespace
  return content.split(/\s+/).filter((w) => w.length > 0).length;
}

function sanitizeArticleNumbers(
  article: {
    word_count: number | string | unknown;
    estimated_minutes: number | string | unknown;
    difficulty: number | string | unknown;
    content: string;
  },
  language: string
): { word_count: number; estimated_minutes: number; difficulty: number } {
  const rawWordCount = toSafeInt(article.word_count, 0, 0);
  const wordCount = rawWordCount > 0 ? rawWordCount : computeWordCount(article.content, language);
  const estimatedMinutes =
    toSafeInt(article.estimated_minutes, 0, 1) > 0
      ? toSafeInt(article.estimated_minutes, 0, 1)
      : Math.max(1, Math.round(wordCount / (language === "en" ? 100 : 80)));
  const difficulty = toSafeInt(article.difficulty, 3, 1, 5);
  return { word_count: wordCount, estimated_minutes: estimatedMinutes, difficulty };
}

function coerceQuestionDifficulty(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(5, value));
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    const map: Record<string, number> = {
      easy: 2,
      简单: 2,
      medium: 3,
      中等: 3,
      hard: 4,
      困难: 4,
    };
    if (map[lower] !== undefined) return map[lower];
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(1, Math.min(5, parsed));
  }
  return 3;
}

const VALID_QUESTION_TYPES = ['main_idea', 'detail', 'inference', 'vocabulary', 'sequence'] as const;
type ValidQuestionType = typeof VALID_QUESTION_TYPES[number];

function coerceQuestionType(value: unknown): ValidQuestionType {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
    const map: Record<string, ValidQuestionType> = {
      'main_idea': 'main_idea',
      'mainidea': 'main_idea',
      'main_idea_question': 'main_idea',
      'detail': 'detail',
      'details': 'detail',
      'inference': 'inference',
      'infer': 'inference',
      'vocabulary': 'vocabulary',
      'vocab': 'vocabulary',
      'vocabulary_question': 'vocabulary',
      'sequence': 'sequence',
      'sequencing': 'sequence',
      'order': 'sequence',
    };
    if (map[normalized]) return map[normalized];
    if (VALID_QUESTION_TYPES.includes(normalized as ValidQuestionType)) return normalized as ValidQuestionType;
  }
  return 'detail';
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
  grade: number
): Promise<ExistingArticleCheck> {
  const { data, error } = await supabase
    .from("reading_articles")
    .select("id, status")
    .eq("topic_key", topicKey)
    .eq("grade_level", grade)
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
  contentSource: string;
  coverImageUrl: string | null;
  coverSource: string | null;
  coverSourceUrl: string | null;
  qualityIssues: unknown[] | null;
  language: string;
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
        content_source: articleData.contentSource,
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
        language: articleData.language,
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

async function updateArticleCover(
  supabase: SupabaseClient<PipelineDatabase>,
  articleId: string,
  coverImageUrl: string | null,
  coverSource: string | null,
  coverSourceUrl: string | null
): Promise<void> {
  const { error } = await (supabase as SupabaseClient)
    .from("reading_articles")
    .update({
      cover_image_url: coverImageUrl,
      cover_source: coverSource,
      cover_source_url: coverSourceUrl,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(`Failed to update article cover: ${error.message}`);
  }
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
        question_type: coerceQuestionType(q.question_type),
        options: q.options,
        correct_answer: q.correct_answer,
        difficulty: coerceQuestionDifficulty(q.difficulty),
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
    .select("topic_key, category, source, source_text, source_url, source_image_url, target_grades")
    .eq("language", pipelineLanguage)
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
  grade: GradeVariant;
}

interface QualityCheckResult {
  fitsLevel: boolean;
  needsExpansion: boolean;
  wordCount: number;
  simplePct: number;
  compoundPct: number;
  complexPct: number;
}

function checkSourceQuality(sourceText: string | undefined, grade: number, language: string): QualityCheckResult {
  if (!sourceText) {
    return { fitsLevel: false, needsExpansion: true, wordCount: 0, simplePct: 0, compoundPct: 0, complexPct: 0 };
  }

  const isZh = language === "zh";
  const words = isZh
    ? (sourceText.match(/[一-鿿]/g) || []).length
    : sourceText.split(/\s+/).filter(w => w.length > 0).length;

  const sentenceDelimiter = isZh ? /[。！？.!?\n]+/ : /[.!?]+/;
  const sentences = sourceText.split(sentenceDelimiter).filter(s => s.trim().length > 5);

  let simple = 0, compound = 0, complex = 0;
  if (!isZh) {
    for (const s of sentences) {
      const st = s.trim().toLowerCase();
      const hasConjunction = /\b(and|but|or|so|yet|for|nor)\b/.test(st);
      const hasSubordinator = /\b(because|since|although|though|while|when|if|that|which|who|where|after|before|until|unless|even though)\b/.test(st);

      if (!hasConjunction && !hasSubordinator) simple++;
      else if (hasConjunction && !hasSubordinator) compound++;
      else complex++;
    }
  } else {
    // Chinese: skip syntax analysis (no reliable heuristic without NLP)
    simple = sentences.length;
    compound = 0;
    complex = 0;
  }

  const total = sentences.length || 1;
  const simplePct = Math.round((simple / total) * 100);
  const compoundPct = Math.round((compound / total) * 100);
  const complexPct = Math.round((complex / total) * 100);

  // Grade standards from reading-standards.json
  const range = getWordCountRange(language as "en" | "zh", grade);
  const syntax = getSyntaxDistribution(grade, language as "en" | "zh");

  // Check if source text fits the grade (with 10% tolerance)
  const wordFits = words >= range.min * 0.9 && words <= range.max * 1.1;
  const syntaxFits = simplePct <= syntax.simple + 10 && compoundPct >= syntax.compound - 10 && complexPct >= syntax.complex - 10;

  const fitsLevel = wordFits && syntaxFits;
  const needsExpansion = words < range.min;

  return { fitsLevel, needsExpansion, wordCount: words, simplePct, compoundPct, complexPct };
}

async function main(): Promise<void> {
  console.log("=== Reading Content Pipeline ===\n");

  // Validate environment
  validateEnv();

  // Parse grades (PIPELINE_GRADES takes precedence over PIPELINE_LEVELS)
  const gradesEnv = process.env.PIPELINE_GRADES;
  const grades: number[] = gradesEnv
    ? gradesEnv.split(",").map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= 10)
    : [];

  // Fallback: parse levels and map to representative grades
  if (grades.length === 0) {
    const levels = (process.env.PIPELINE_LEVELS || "L1,L2,L3")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => ["L1", "L2", "L3"].includes(s));
    const levelGradeMap: Record<string, number> = { L1: 3, L2: 6, L3: 8 };
    for (const lv of levels) {
      grades.push(levelGradeMap[lv]);
    }
  }

  const topicLimit = parseInt(process.env.PIPELINE_TOPIC_LIMIT || "0", 10);

  if (grades.length === 0) {
    console.error("ERROR: No valid grades configured. Use PIPELINE_GRADES=\"4,7\" or PIPELINE_LEVELS=\"L1,L2,L3\".");
    process.exit(1);
  }

  const gradesDisplay = gradesEnv ? grades.join(", ") : grades.join(", ") + " (mapped from levels)";
  console.log(`Grades:     ${gradesDisplay}`);
  console.log(`Language:   ${pipelineLanguage}`);
  console.log(`Model:      ${process.env.OPENAI_READING_MODEL || "MiniMax-M3"}`);
  console.log(`Base URL:   ${process.env.OPENAI_BASE_URL || "https://api.minimaxi.com/v1"}`);
  console.log("");

  const supabase = await getSupabaseClient();

  // Optional: scrape content sources before loading topics
  const scrapeFirst = process.argv.includes("--scrape-first");
  if (scrapeFirst) {
    console.log("Scraping content sources first...");
    await scrapeAllSources({ dryRun: false, lang: pipelineLanguage });
    console.log("");
  }

  // Load topics from database
  const topics = await loadTopics(supabase, topicLimit);
  console.log(`Topics:     ${topics.length} (${topicLimit > 0 ? `limited to ${topicLimit}` : "all"})`);
  console.log("");

  if (topics.length === 0) {
    console.warn("WARNING: No active topics found in reading_topics table.");
  }

  // Collect all work items (topic, grade) pairs
  const workItems: WorkItem[] = [];
  for (const grade of grades) {
    for (const topic of topics) {
      workItems.push({ topic, grade });
    }
  }

  let total = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  // Create global pacer for LLM call concurrency (max 3 concurrent across all tasks)
  const pacer = new Pacer(3);
  const tasks = workItems.map((item, index) =>
    processWorkItem(item, index + 1, workItems.length, grades, topics, supabase, pacer)
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
  reason?: string;
}

function isExternalServiceError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (msg.includes("429")) return true;
  if (msg.includes("402")) return true;
  if (lower.includes("timeout")) return true;
  if (lower.includes("econnreset")) return true;
  if (lower.includes("fetch failed")) return true;
  if (lower.includes("fetch error")) return true;
  if (lower.includes("network")) return true;
  if (lower.includes("aborterror") || lower.includes("abort")) return true;
  if (lower.includes("socket hang up")) return true;
  if (lower.includes("connection refused")) return true;
  if (lower.includes("dns lookup")) return true;
  return false;
}

async function processWorkItem(
  item: WorkItem,
  index: number,
  total: number,
  grades: number[],
  topics: ReadingTopicRow[],
  supabase: SupabaseClient<PipelineDatabase>,
  pacer: InstanceType<typeof Pacer>
): Promise<ProcessResult> {
  const { topic, grade } = item;
  const key = `${topic.topic_key}|G${grade}`;
  process.stdout.write(
    `[${index}/${total}] ${key} (${topic.category})... `
  );

  try {
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

    // Step 2: Resolve sourceText from corpus if not provided in topic
    const corpusEntry = getCorpusEntry(topic.topic_key, pipelineLanguage);
    const sourceText = topic.source_text || corpusEntry?.content || undefined;

    // Guard: if source text is missing or too short, force route C (full generation)
    const hasUsableSource = !!sourceText && sourceText.trim().length >= 50;

    // Step 3: Check source text quality and decide route
    const qualityCheck = checkSourceQuality(sourceText, grade, pipelineLanguage);
    let contentResult;

    if (qualityCheck.fitsLevel && hasUsableSource) {
      // Route A: Source text fits the grade directly — use as-is with minor cleanup
      console.log("USE-DIRECT");
      contentResult = await pacer.run(() =>
        withRetry(() =>
          generateReadingContent({
            topicKey: topic.topic_key,
            language: pipelineLanguage,
            category: topic.category,
            schoolGrade: grade,
            sourceText,
            route: "A", // Direct use
          })
        )
      );
    } else if (hasUsableSource) {
      // Route B/C: Source text needs adaptation — rewrite/expand/compress
      console.log("REWRITE");
      contentResult = await pacer.run(() =>
        withRetry(() =>
          generateReadingContent({
            topicKey: topic.topic_key,
            language: pipelineLanguage,
            category: topic.category,
            schoolGrade: grade,
            sourceText,
            route: qualityCheck.needsExpansion ? "B" : "C",
          })
        )
      );
    } else {
      // No usable source — force route C (full generation from scratch)
      console.log("NO-SOURCE → GENERATE");
      contentResult = await pacer.run(() =>
        withRetry(() =>
          generateReadingContent({
            topicKey: topic.topic_key,
            language: pipelineLanguage,
            category: topic.category,
            schoolGrade: grade,
            sourceText: undefined,
            route: "C",
          })
        )
      );
    }

    const { article, questions, illustrations } = contentResult;

    // Step 4: Run quality gate, IB criteria gate, and factual accuracy gate
    const gate = validateContent({
      article,
      questions,
      language: pipelineLanguage,
      gradeLevel: grade,
    });
    const ibGate = validateIBCriteria({
      article,
      questions,
      language: pipelineLanguage,
      gradeLevel: grade,
    });
    const factualGate = validateFactualAccuracy({
      article,
      sourceText,
      keyFacts: topic.key_facts || undefined,
      language: pipelineLanguage,
      gradeLevel: grade,
    });

    // Merge issues with source tagging
    const allIssues = [
      ...gate.issues.map(i => ({ ...i, source: "quality" as const })),
      ...ibGate.issues.map(i => ({ ...i, source: "ib-criteria" as const })),
      ...factualGate.issues.map(i => ({ ...i, source: "factual" as const })),
    ];

    // Route A: skip factual gate (original text is the ground truth)
    const effectiveFactualPass = qualityCheck.fitsLevel ? true : factualGate.pass;
    const status: "draft" | "published" = gate.pass && ibGate.pass && effectiveFactualPass ? "published" : "draft";

    // Step 5: Upsert article FIRST to get real articleId
    const sanitized = sanitizeArticleNumbers(article, pipelineLanguage);
    const articleId = await upsertArticle(supabase, {
      topicKey: topic.topic_key,
      gradeLevel: grade,
      title: article.title,
      content: article.content,
      sourceUrl: topic.source_url,
      category: topic.category,
      wordCount: sanitized.word_count,
      estimatedMinutes: sanitized.estimated_minutes,
      difficulty: sanitized.difficulty,
      sceneDescription: article.scene_description,
      summary: article.summary,
      status,
      contentSource: qualityCheck.fitsLevel ? "original" : qualityCheck.needsExpansion ? "adapted" : "llm",
      coverImageUrl: null,
      coverSource: null,
      coverSourceUrl: null,
      qualityIssues: allIssues.length > 0 ? allIssues : null,
      language: pipelineLanguage,
    });

    // Step 6: Upsert chapters if article has chapterized content
    // Uses ON CONFLICT (article_id, index) DO UPDATE for atomicity
    if (article.chapters && article.chapters.length > 0) {
      const { error: chErr } = await (supabase as SupabaseClient)
        .from("reading_article_chapters")
        .upsert(
          article.chapters.map((ch) => ({
            article_id: articleId,
            index: ch.index,
            heading: ch.heading,
            content: ch.content,
            word_count: ch.word_count,
            summary: ch.summary ?? null,
          })),
          { onConflict: "article_id, index" }
        );

      if (chErr) {
        throw new Error(`Failed to upsert chapters: ${chErr.message}`);
      }
      console.log(`\n  [chapters] ${article.chapters.length} chapters upserted`);
    }

    // Step 7: Generate cover image with REAL articleId
    let coverResult: { url: string; source: string; source_url: string } | null = null;
    try {
      coverResult = await pacer.run(() =>
        withRetry(() =>
          generateCover({
            articleId,
            language: pipelineLanguage,
            category: topic.category,
            scene: article.scene_description,
            title: article.title,
            sourceImageUrl: topic.source_image_url ?? undefined,
          })
        )
      );
    } catch (coverErr) {
      const reason = coverErr instanceof Error ? coverErr.message : String(coverErr);
      console.warn(`\n  [cover] failed: ${reason}`);
    }

    // Step 8: Update article cover fields
    if (coverResult) {
      const coverSource = coverResult.source === "source-website" ? "pollinations" : coverResult.source;
      await updateArticleCover(
        supabase,
        articleId,
        coverResult.url,
        coverSource,
        coverResult.source_url
      );
    }

    // Step 9: Generate in-article illustrations with REAL articleId
    let illustrationResults: { paragraph_index: number; url: string; source_url: string; source: string }[] = [];
    try {
      illustrationResults = await pacer.run(() =>
        withRetry(() =>
          generateIllustrations({
            articleId,
            language: pipelineLanguage,
            category: topic.category,
            scenes: illustrations.map((ill: { paragraph_index: number; scene_description: string }) => ({
              paragraphIndex: ill.paragraph_index,
              sceneDescription: ill.scene_description,
            })),
            sourceImageUrls: topic.source_inline_image_urls ?? undefined,
          })
        )
      );
    } catch (illErr) {
      const reason = illErr instanceof Error ? illErr.message : String(illErr);
      console.warn(`\n  [illustrations] failed: ${reason}`);
    }

    // Step 10: Replace questions (DB operation, outside pacer)
    await replaceQuestions(supabase, articleId, questions);

    // Step 11: Replace illustrations (DB operation, outside pacer)
    await replaceIllustrations(
      supabase,
      articleId,
      illustrationResults.map((ill) => ({
        paragraph_index: ill.paragraph_index,
        image_url: ill.url,
        source_url: ill.source_url,
        source: ill.source === "source-website" || ill.source === "dalle" ? "pollinations" : ill.source,
        scene_description:
          illustrations.find((i: { paragraph_index: number; scene_description: string }) => i.paragraph_index === ill.paragraph_index)
            ?.scene_description || "",
      }))
    );

    const sourceCount = illustrationResults.filter(r => r.source === "source-website").length;
    const aiCount = illustrationResults.length - sourceCount;
    const gateLabel = gate.pass && ibGate.pass && effectiveFactualPass ? "published" : "draft";
    const routeLabel = qualityCheck.fitsLevel ? "direct" : qualityCheck.needsExpansion ? "expand" : "rewrite";
    const chapterInfo = article.chapters?.length ? ` ${article.chapters.length}ch` : "";
    console.log(
      `OK — "${article.title}" route=${routeLabel}${chapterInfo} (${questions.length} questions, ${illustrationResults.length} illustrations [${sourceCount} source, ${aiCount} AI], quality=${gate.pass ? "pass" : "fail"}, ib=${ibGate.pass ? "pass" : "fail"}, factual=${effectiveFactualPass ? "pass" : "skip"}, ${gateLabel})`
    );
    return { status: "succeeded" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isExternalServiceError(err)) {
      console.log(`[EXTERNAL-SKIP] ${message}`);
      return { status: "skipped", reason: `external: ${message}` };
    }
    console.log(`FAIL — ${message}`);
    return { status: "failed", reason: message };
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