#!/usr/bin/env node
/**
 * Incremental Draft Article Repair
 *
 * Instead of fully regenerating draft articles (expensive), this script:
 * 1. word-count-out-of-range -> calls LLM to expand/compress content
 * 2. critical-thinking-ratio-error / critical-thinking-ratio-warn -> regenerates only questions
 * 3. question-type-distribution-skew -> regenerates only questions
 * 4. Other issues -> skips (needs full regeneration)
 *
 * Usage:
 *   npx tsx scripts/repair-draft-articles.ts --limit=20
 *   npx tsx scripts/repair-draft-articles.ts --language=en --dry-run
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const requiredEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

import OpenAI from "openai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { validateContent } from "@/lib/reading";
import { validateIBCriteria } from "@/lib/reading";
import type { GeneratedQuestion, ReadingQuestionType } from "@/lib/reading/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QualityGateIssue {
  code: string;
  severity: string;
  message: string;
}

interface DraftArticleRow {
  id: string;
  topic_key: string;
  title: string;
  grade_level: number;
  language: string;
  category: string;
  content: string;
  summary: string;
  word_count: number;
  estimated_minutes: number;
  difficulty: number;
  scene_description: string;
  quality_issues: QualityGateIssue[] | null;
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

// ---------------------------------------------------------------------------
// Issue classification
// ---------------------------------------------------------------------------

type IssueCategory = "repairable-word-count" | "repairable-questions" | "needs-regen";

const REPAIRABLE_WORD_COUNT = new Set(["word-count-out-of-range"]);
const REPAIRABLE_QUESTIONS = new Set([
  "critical-thinking-ratio-error",
  "critical-thinking-ratio-warn",
  "question-type-distribution-skew",
]);
const NEEDS_REGEN = new Set([
  "content-bloat",
  "coherence",
  "pinyin-char-count-mismatch",
  "classical-quote-not-in-content",
  "genre-missing",
  "genre-invalid",
  "cultural-connection-missing",
  "author-purpose-missing",
  "author-purpose-invalid",
]);

function classifyIssue(code: string): IssueCategory {
  if (REPAIRABLE_WORD_COUNT.has(code)) return "repairable-word-count";
  if (REPAIRABLE_QUESTIONS.has(code)) return "repairable-questions";
  return "needs-regen";
}

function classifyArticle(issues: QualityGateIssue[]): {
  category: IssueCategory;
  codes: string[];
} {
  let found: IssueCategory = "needs-regen";
  const codes: string[] = [];
  for (const i of issues) {
    codes.push(i.code);
    const c = classifyIssue(i.code);
    if (c === "repairable-word-count") found = "repairable-word-count";
    else if (c === "repairable-questions" && found !== "repairable-word-count") found = "repairable-questions";
  }
  return { category: found, codes };
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

async function expandOrCompress(
  content: string,
  currentCount: number,
  targetMin: number,
  targetMax: number,
  unit: string,
  language: string
): Promise<string | null> {
  const low = currentCount < targetMin;
  const action = low ? "expanded" : "compressed";
  const targetRange = `${targetMin}-${targetMax}`;

  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_READING_MODEL || "MiniMax-M2.7",
    messages: [
      {
        role: "system",
        content: `You are a children's reading content editor. Revise the article to match the required word count. Return ONLY the revised article text, nothing else.`,
      },
      {
        role: "user",
        content: `The following article needs to be ${action} to ${targetRange} ${unit} (currently ${currentCount}).
Preserve ALL facts, narrative structure, and educational value.

${content}

Return ONLY the revised article text, nothing else.`,
      },
    ],
    temperature: 0.5,
    max_tokens: 4096,
  });

  return resp.choices[0]?.message?.content?.trim() || null;
}

async function regenerateQuestionsOnly(
  article: DraftArticleRow,
  topicText: string | null
): Promise<GeneratedQuestion[] | null> {
  const lang = article.language as "zh" | "en";

  // Route A style prompt: use existing article content, ask LLM for questions only
  const systemMsg = "You are a children's reading assessment expert. Given a complete article, create comprehension questions. Return ONLY valid JSON matching the expected schema. No markdown fences, no extra text.";

  const userMsg = lang === "en"
    ? `Create comprehension questions for the following article. DO NOT output the article content.

Article:
${article.content.slice(0, 8000)}

Create 5-8 comprehension questions.
Question types: main_idea, detail, inference, vocabulary, sequence.
Mix of types across questions.
Each question MUST have EXACTLY 4 options labeled "A", "B", "C", "D".
Exactly one correct answer. Difficulty scale: 1 (easiest) to 5 (hardest).
At least 30% of questions MUST be inference type.

Return STRICT JSON:
{
  "questions": [
    {
      "question_text": "What is the main idea of the passage?",
      "question_type": "main_idea",
      "options": [
        {"label":"A","text":"First option"},
        {"label":"B","text":"Second option"},
        {"label":"C","text":"Third option"},
        {"label":"D","text":"Fourth option"}
      ],
      "correct_answer": "A",
      "difficulty": 3
    }
  ]
}`
    : `为以下文章创建阅读理解题。请勿输出文章正文。

文章：
${article.content.slice(0, 4000)}

创建5-8道阅读理解题。
题型：main_idea（主旨）、detail（细节）、inference（推理）、vocabulary（词汇）、sequence（顺序）。
混合题型。
每道题必须有且仅有4个选项，标记为"A"、"B"、"C"、"D"。
只有一个正确答案。难度：1（最简单）到5（最难）。
至少30%的题必须是 inference（推理）类型。

返回严格JSON：
{
  "questions": [
    {
      "question_text": "这篇文章的主要内容是什么？",
      "question_type": "main_idea",
      "options": [
        {"label":"A","text":"第一个选项"},
        {"label":"B","text":"第二个选项"},
        {"label":"C","text":"第三个选项"},
        {"label":"D","text":"第四个选项"}
      ],
      "correct_answer": "A",
      "difficulty": 3
    }
  ]
}`;

  try {
    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_READING_MODEL || "MiniMax-M2.7",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      temperature: 0.6,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });

    const raw = resp.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const questions = parsed.questions;
    if (!Array.isArray(questions) || questions.length === 0) return null;

    return questions.map((q: any) => ({
      question_text: String(q.question_text || ""),
      question_type: coerceQuestionType(q.question_type),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map((o: any) => ({
        label: String(o.label || ""),
        text: String(o.text || ""),
      })) : [],
      correct_answer: String(q.correct_answer || "A"),
      difficulty: Number(q.difficulty) || 3,
    }));
  } catch (err) {
    console.error(`  Question regeneration failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Word count helpers
// ---------------------------------------------------------------------------

import { getWordCountRange, coerceQuestionType } from "@/lib/reading/standards";

function countWords(content: string, lang: string): number {
  if (lang === "zh") {
    return (content.match(/[一-鿿]/g) || []).length;
  }
  return content.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 50;
  const dryRun = args.includes("--dry-run");
  const langArg = args.find((a) => a.startsWith("--language="));
  const language = langArg ? langArg.split("=")[1] : undefined;

  const supabase = await createServiceRoleClient();

  // Load draft articles with full content
  let query = supabase
    .from("reading_articles")
    .select("id, topic_key, title, grade_level, language, category, content, summary, word_count, estimated_minutes, difficulty, scene_description, quality_issues")
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

  console.log(`Found ${drafts?.length || 0} draft articles to repair\n`);

  const stats = {
    total: drafts?.length || 0,
    repairable: 0,
    repairableWordCount: 0,
    repairableQuestions: 0,
    needsRegen: 0,
    repaired: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of (drafts || []) as DraftArticleRow[]) {
    const issues: QualityGateIssue[] = row.quality_issues || [];
    if (issues.length === 0) {
      console.log(`[${row.topic_key} G${row.grade_level}] SKIP - no quality issues`);
      stats.skipped++;
      continue;
    }

    const { category, codes } = classifyArticle(issues);
    console.log(`[${row.topic_key} G${row.grade_level}] Issues: ${codes.join(", ")} -> ${category}`);

    if (category === "needs-regen") {
      console.log(`  SKIP - contains issues requiring full regeneration`);
      stats.needsRegen++;
      stats.skipped++;
      continue;
    }

    stats.repairable++;
    if (category === "repairable-word-count") stats.repairableWordCount++;
    else stats.repairableQuestions++;

    if (dryRun) {
      console.log(`  [DRY RUN] Would repair`);
      continue;
    }

    let updatedContent = row.content;
    let updatedQuestions: GeneratedQuestion[] | null = null;
    let repairAttempted = false;

    // Step 1: Fix word count if needed
    if (category === "repairable-word-count") {
      const range = getWordCountRange(row.language as "en" | "zh", row.grade_level);
      const currentCount = countWords(row.content, row.language);
      const unit = row.language === "en" ? "words" : "Chinese characters";
      console.log(`  Word count: ${currentCount} ${unit}, target: ${range.min}-${range.max}`);

      if (currentCount >= range.min && currentCount <= range.max) {
        console.log(`  Word count already in range, skipping expansion/compression`);
      } else {
        repairAttempted = true;
        const revised = await expandOrCompress(row.content, currentCount, range.min, range.max, unit, row.language);
        if (revised) {
          updatedContent = revised;
          console.log(`  Content ${currentCount < range.min ? "expanded" : "compressed"} (${countWords(revised, row.language)} ${unit})`);
        } else {
          console.log(`  Content repair failed, keeping original`);
        }
      }
    }

    // Step 2: Fix questions if needed
    if (category === "repairable-questions") {
      repairAttempted = true;
      updatedQuestions = await regenerateQuestionsOnly(row, null);
      if (updatedQuestions) {
        console.log(`  Regenerated ${updatedQuestions.length} questions`);
      } else {
        console.log(`  Question regeneration failed`);
      }
    }

    if (!repairAttempted) {
      console.log(`  SKIP - no repair action needed`);
      stats.skipped++;
      continue;
    }

    // Step 3: Re-run quality gates
    const wordCount = countWords(updatedContent, row.language);
    const estimatedMinutes = Math.max(1, Math.round(wordCount / (row.language === "en" ? 100 : 80)));

    const articleObj = {
      title: row.title,
      content: updatedContent,
      summary: row.summary,
      word_count: wordCount,
      estimated_minutes: estimatedMinutes,
      difficulty: row.difficulty,
      scene_description: row.scene_description,
    };

    const testQuestions = updatedQuestions || [];

    const gate = validateContent({
      article: articleObj,
      questions: testQuestions,
      language: row.language as "zh" | "en",
      gradeLevel: row.grade_level,
    });

    const ibGate = validateIBCriteria({
      article: articleObj,
      questions: testQuestions,
      language: row.language as "zh" | "en",
      gradeLevel: row.grade_level,
    });

    const qualityPass = gate.pass && ibGate.pass;

    if (qualityPass) {
      // Step 4: Update article and questions
      const updateData: Record<string, any> = {
        content: updatedContent,
        word_count: wordCount,
        estimated_minutes: estimatedMinutes,
        quality_issues: null,
      };

      if (updatedQuestions) {
        updateData.quality_issues = null;
      }

      await supabase
        .from("reading_articles")
        .update(updateData)
        .eq("id", row.id);

      if (updatedQuestions && updatedQuestions.length > 0) {
        await supabase.from("reading_questions").delete().eq("article_id", row.id);
        await supabase.from("reading_questions").insert(
          updatedQuestions.map((q, i) => ({
            article_id: row.id,
            question_text: q.question_text,
            question_type: coerceQuestionType(q.question_type),
            options: q.options,
            correct_answer: q.correct_answer,
            difficulty: q.difficulty,
            order_index: i + 1,
          }))
        );
      }

      console.log(`  REPAIRED - all quality gates pass`);
      stats.repaired++;
    } else {
      const allIssues = [...gate.issues, ...ibGate.issues];
      const errors = allIssues.filter((i) => i.severity === "error");
      console.log(`  STILL FAILS after repair - ${errors.map((i) => i.code).join(", ")}`);
      stats.failed++;
    }
  }

  console.log(`\n=== REPAIR DRAFT COMPLETE ===`);
  console.log(`Total:             ${stats.total}`);
  console.log(`Repairable:        ${stats.repairable} (WC:${stats.repairableWordCount} Q:${stats.repairableQuestions})`);
  console.log(`Needs regen:       ${stats.needsRegen}`);
  console.log(`Repaired:          ${stats.repaired}`);
  console.log(`Failed:            ${stats.failed}`);
  console.log(`Skipped:           ${stats.skipped}`);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
