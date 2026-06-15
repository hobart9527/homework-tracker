#!/usr/bin/env npx tsx

/**
 * Generate sample reading articles from topics for each source.
 * Processes a small batch so the user can verify multi-source generation.
 *
 * Usage:
 *   npx tsx scripts/reading/generate-sample-articles.ts [--source dogo|bbc-newsround|seed-script] [--limit 4]
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  generateReadingContent,
  generateCover,
  generateIllustrations,
  validateContent,
  validateIBCriteria,
  validateFactualAccuracy,
  convertToRubyPinyin,
} from "../../src/lib/reading";
import { decideRoute } from "../../src/lib/reading/route-analyzer";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const sourceFilter = args.find((a) => a.startsWith("--source="))?.split("=")[1] || "";
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "4");
const skipImages = args.includes("--skip-images");

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TopicRow {
  topic_key: string;
  category: string;
  language: "zh" | "en";
  source: string | null;
  source_text: string | null;
  source_url: string | null;
  source_image_url: string | null;
  target_grades: number[];
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function runPipeline(topic: TopicRow, grade: number): Promise<{ ok: boolean; articleId?: string; error?: string }> {
  const topicKey = topic.topic_key;
  const category = topic.category;
  const sourceText = topic.source_text || "";
  const sourceUrl = topic.source_url;

  const routeDecision = decideRoute({
    topic_key: topic.topic_key,
    language: topic.language,
    source: topic.source ?? null,
    source_text: sourceText,
    target_grades: topic.target_grades,
  });

  const baseGrade = topic.target_grades?.[0] ?? grade;
  const effectiveRoute: "A" | "B" | "C" =
    routeDecision.route === "A" && grade !== baseGrade ? "C" : routeDecision.route;

  console.log(`  [${topicKey}] G${grade} route=${effectiveRoute} (source=${topic.source})`);

  // 1. Generate
  const { article, questions, illustrations: generatedIllustrations } =
    await generateReadingContent({
      topicKey,
      language: topic.language,
      category,
      gradeLevel: grade,
      sourceText,
      route: effectiveRoute,
    });

  // 2. Quality gates
  const gate = validateContent({ article, questions, language: topic.language, gradeLevel: grade });
  const ibCriteria = validateIBCriteria({ article, questions, language: topic.language, gradeLevel: grade });
  const factualCriteria = validateFactualAccuracy({
    article,
    sourceText: topic.source_text || undefined,
    language: topic.language,
    gradeLevel: grade,
  });

  const effectiveFactualPass = routeDecision.route === "A" ? true : factualCriteria.pass;
  const articleStatus = gate.pass && ibCriteria.pass && effectiveFactualPass ? "published" : "draft";

  // 3. Upsert article
  const isChinese = /[一-鿿]/.test(article.content);
  const language = isChinese ? "zh" : "en";
  const pinyin_content = isChinese ? convertToRubyPinyin(article.content) : null;

  const { data: articleData, error: articleError } = await sb
    .from("reading_articles")
    .upsert(
      {
        topic_key: topicKey,
        title: article.title,
        content: article.content,
        source: "news_api",
        source_url: sourceUrl || null,
        content_source: routeDecision.route === "A" ? "original" : routeDecision.route === "B" ? "adapted" : "llm",
        category,
        grade_level: grade,
        language,
        word_count: language === "en"
          ? article.content.trim().split(/\s+/).filter(Boolean).length
          : (article.content.match(/[一-鿿]/g) || []).length,
        estimated_minutes: article.estimated_minutes,
        difficulty: article.difficulty,
        status: articleStatus,
        scene_description: article.scene_description || null,
        quality_issues: [...gate.issues, ...ibCriteria.issues, ...factualCriteria.issues].length > 0
          ? [...gate.issues, ...ibCriteria.issues, ...factualCriteria.issues]
          : null,
        pinyin_content,
      },
      { onConflict: "topic_key,grade_level" }
    )
    .select("id")
    .single();

  if (articleError) {
    throw new Error(`article upsert failed: ${articleError.message}`);
  }

  const articleId = articleData.id;

  // 4. Cover image
  if (!skipImages) {
    try {
      const cover = await generateCover({
        articleId,
        language: topic.language,
        category,
        scene: article.scene_description || article.title,
        title: article.title,
        sourceImageUrl: topic.source_image_url ?? undefined,
      });
      if (!cover) {
        console.warn(`    Cover: SKIP (all providers failed)`);
        return { ok: false, error: "no cover" };
      }
      await sb
        .from("reading_articles")
        .update({
          cover_image_url: cover.url,
          cover_source: cover.source === "source-website" ? "pollinations" : cover.source,
          cover_source_url: cover.source_url,
        })
        .eq("id", articleId);
      console.log(`    Cover: ${cover.source}`);
    } catch (err) {
      console.warn(`    Cover failed: ${(err as Error).message}`);
    }
  }

  // 5. Questions
  await sb.from("reading_questions").delete().eq("article_id", articleId);
  const questionRows = questions.map((q, i) => ({
    article_id: articleId,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.options,
    correct_answer: q.correct_answer,
    difficulty: q.difficulty,
    order_index: i,
    hint: q.hint ?? null,
    explanation: q.explanation ?? null,
  }));
  if (questionRows.length > 0) {
    const { error: qError } = await sb.from("reading_questions").insert(questionRows);
    if (qError) console.warn(`    Questions failed: ${qError.message}`);
  }

  // 6. Illustrations
  if (!skipImages && generatedIllustrations.length > 0) {
    try {
      await sb.from("reading_article_illustrations").delete().eq("article_id", articleId);
      const illustrationResults = await generateIllustrations({
        articleId,
        language: topic.language,
        category,
        scenes: generatedIllustrations.map((ill) => ({
          paragraphIndex: ill.paragraph_index,
          sceneDescription: ill.scene_description,
        })),
      });
      if (illustrationResults.length > 0) {
        const rows = illustrationResults.map((ill) => ({
          article_id: articleId,
          paragraph_index: ill.paragraph_index,
          image_url: ill.url,
          source_url: ill.source_url,
          source: ill.source === "source-website" || ill.source === "dalle" ? "pollinations" : ill.source,
          scene_description:
            generatedIllustrations.find((g) => g.paragraph_index === ill.paragraph_index)?.scene_description || null,
        }));
        await sb.from("reading_article_illustrations").insert(rows);
        console.log(`    Illustrations: ${rows.length}`);
      }
    } catch (err) {
      console.warn(`    Illustrations failed: ${(err as Error).message}`);
    }
  }

  return { ok: true, articleId };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Generate Sample Articles ===\n");

  const { data: topics } = await sb
    .from("reading_topics")
    .select("topic_key, category, language, source, source_text, source_url, source_image_url, target_grades")
    .eq("language", "en")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (!topics || topics.length === 0) {
    console.log("No English topics found.");
    return;
  }

  // Group by source
  const bySource: Record<string, TopicRow[]> = {};
  for (const t of topics as TopicRow[]) {
    const s = t.source || "unknown";
    bySource[s] = bySource[s] || [];
    bySource[s].push(t);
  }

  console.log("Topics available:");
  for (const [s, list] of Object.entries(bySource)) {
    console.log(`  ${s}: ${list.length}`);
  }

  // Pick topics to process
  const toProcess: { topic: TopicRow; grade: number }[] = [];
  const sources = sourceFilter ? [sourceFilter] : Object.keys(bySource);

  for (const source of sources) {
    const list = bySource[source] || [];
    let count = 0;
    for (const topic of list) {
      if (count >= Math.ceil(limit / sources.length)) break;
      const grades = topic.target_grades?.length ? topic.target_grades : [3, 6];
      for (const grade of grades.slice(0, 2)) {
        toProcess.push({ topic, grade });
      }
      count++;
    }
  }

  // Dedup against existing
  const topicKeys = [...new Set(toProcess.map((p) => p.topic.topic_key))];
  const { data: existing } = await sb
    .from("reading_articles")
    .select("topic_key, grade_level")
    .in("topic_key", topicKeys);
  const existingSet = new Set((existing || []).map((e) => `${e.topic_key}:${e.grade_level}`));
  const workItems = toProcess.filter((p) => !existingSet.has(`${p.topic.topic_key}:${p.grade}`));

  console.log(`\nProcessing ${workItems.length} article/grade combos...\n`);

  let ok = 0;
  let fail = 0;

  for (const item of workItems) {
    try {
      const result = await runPipeline(item.topic, item.grade);
      if (result.ok) {
        console.log(`  -> OK articleId=${result.articleId}\n`);
        ok++;
      } else {
        console.log(`  -> FAIL: ${result.error}\n`);
        fail++;
      }
    } catch (err) {
      console.error(`  -> ERROR: ${(err as Error).message}\n`);
      fail++;
    }
  }

  console.log("=== SUMMARY ===");
  console.log(`Processed: ${workItems.length}`);
  console.log(`OK: ${ok}`);
  console.log(`Failed: ${fail}`);
}

main().catch(console.error);
