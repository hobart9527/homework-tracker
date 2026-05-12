#!/usr/bin/env tsx
/**
 * Seed Chinese Graded Reading Content
 * 从 reading_topics 表读取中文主题，通过统一管线生成文章。
 *
 * Usage: npx tsx scripts/seed-chinese-reading-content.ts [--scrape-first]
 * 需要环境变量: OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

import { config } from "dotenv";
import { getCorpusEntry } from "./reading/classic-corpus";
import scrapeAllSources from "./reading/scrape-all-sources";
config({ path: ".env.local" });

interface TaskEntry {
  topic: {
    topic_key: string;
    category: string;
    target_grades: number[] | null;
    key_facts: string[] | null;
  };
  grade: number;
  topicKey: string;
}

interface GenerationResult {
  topicKey: string;
  topic_key: string;
  grade: number;
  category: string;
  article: Awaited<ReturnType<typeof import("@/lib/reading").generateReadingContent>>["article"];
  questions: Awaited<ReturnType<typeof import("@/lib/reading").generateReadingContent>>["questions"];
  generatedIllustrations: Awaited<ReturnType<typeof import("@/lib/reading").generateReadingContent>>["illustrations"];
  coverResult: Awaited<ReturnType<typeof import("@/lib/reading").generateCover>> | null;
  pinyinContent: string;
  status: "published" | "draft";
  gate: { pass: boolean; issues: string[] };
  allIssues: Array<{ code: string; severity: string; message: string; source: string }>;
}

async function main() {
  // Dynamic imports after dotenv config so env vars are available.
  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const { Pacer, withRetry } = await import("@/lib/reading/concurrency");
  const {
    generateReadingContent,
    convertToRubyPinyin,
    generateCover,
    generateIllustrations,
    validateContent,
    validateIBCriteria,
    validateFactualAccuracy,
  } = await import("@/lib/reading");

  const pacer = new Pacer(3); // 3 concurrent LLM calls

  const supabase = await createServiceRoleClient();

  // Optional: scrape content sources before loading topics
  const scrapeFirst = process.argv.includes("--scrape-first");
  if (scrapeFirst) {
    console.log("Scraping content sources first...");
    await scrapeAllSources({ dryRun: false, lang: "zh" });
    console.log("");
  }

  // ---------------------------------------------------------------------------
  // Fetch active Chinese topics from reading_topics
  // ---------------------------------------------------------------------------

  const { data: topics, error: topicsError } = await supabase
    .from("reading_topics")
    .select("topic_key, category, target_grades, key_facts")
    .eq("language", "zh")
    .eq("status", "active");

  if (topicsError) {
    console.error(`读取主题失败: ${topicsError.message}`);
    process.exit(1);
  }

  if (!topics || topics.length === 0) {
    console.log("没有找到 active 的中文主题，退出。");
    process.exit(0);
  }

  const TOPIC_LIMIT = parseInt(process.env.TOPIC_LIMIT || "0", 10);
  if (TOPIC_LIMIT > 0) {
    topics.splice(TOPIC_LIMIT);
    console.log(`TOPIC_LIMIT=${TOPIC_LIMIT}，限制处理前 ${TOPIC_LIMIT} 个主题`);
  }

  console.log(`找到 ${topics.length} 个中文主题，开始生成...\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // ---------------------------------------------------------------------------
  // Phase 1: Collect all tasks and filter out existing ones
  // ---------------------------------------------------------------------------

  const allTasks: TaskEntry[] = [];

  for (const topic of topics) {
    const grades: number[] =
      topic.target_grades && topic.target_grades.length > 0
        ? topic.target_grades
        : [3, 5];

    for (const grade of grades) {
      const topicKey = `${topic.topic_key}-G${grade}`;
      allTasks.push({ topic, grade, topicKey });
    }
  }

  // Check which already exist
  const tasksToProcess: TaskEntry[] = [];

  for (const task of allTasks) {
    const { data: existing } = await supabase
      .from("reading_articles")
      .select("id")
      .eq("topic_key", task.topicKey)
      .eq("language", "zh")
      .maybeSingle();

    if (existing) {
      console.log(`已存在，跳过: ${task.topic.topic_key} G${task.grade}`);
      skipCount++;
    } else {
      console.log(`排队中: ${task.topic.topic_key} G${task.grade}...`);
      tasksToProcess.push(task);
    }
  }

  console.log(`\n共 ${tasksToProcess.length} 个任务待处理，并发生成中...\n`);

  // ---------------------------------------------------------------------------
  // Phase 2: Generate content concurrently (up to 3 at a time)
  // ---------------------------------------------------------------------------

  const generationPromises = tasksToProcess.map(
    (task) =>
      pacer.run(async () => {
        console.log(`生成中: ${task.topic.topic_key} G${task.grade}...`);

        try {
          // 0. Lookup sourceText from classic corpus if not provided
          const corpusEntry = getCorpusEntry(task.topic.topic_key, "zh");
          const sourceText = corpusEntry?.content ?? undefined;

          // 1. Generate content via unified pipeline (with retry)
          const { article, questions, illustrations: generatedIllustrations } =
            await withRetry(() =>
              generateReadingContent({
                topicKey: task.topic.topic_key,
                language: "zh",
                category: task.topic.category,
                gradeLevel: task.grade,
                sourceText,
              })
            );

          // 2. Post-process pinyin
          const pinyinContent = convertToRubyPinyin(article.content);

          // 3. Quality gate, IB criteria gate, and factual accuracy gate
          const gate = validateContent({
            article,
            questions,
            language: "zh",
            gradeLevel: task.grade,
          });
          const ibGate = validateIBCriteria({
            article,
            questions,
            language: "zh",
            gradeLevel: task.grade,
          });
          const factualGate = validateFactualAccuracy({
            article,
            sourceText,
            keyFacts: task.topic.key_facts || undefined,
            language: "zh",
            gradeLevel: task.grade,
          });

          // Merge issues with source tagging
          const allIssues = [
            ...gate.issues.map(i => ({ ...i, source: "quality" as const })),
            ...ibGate.issues.map(i => ({ ...i, source: "ib-criteria" as const })),
            ...factualGate.issues.map(i => ({ ...i, source: "factual" as const })),
          ];

          const status = gate.pass && ibGate.pass && factualGate.pass ? "published" : "draft";

          // 4. Generate cover (non-blocking failure)
          let coverResult: Awaited<ReturnType<typeof generateCover>> | null = null;
          try {
            coverResult = await pacer.run(() =>
              withRetry(() =>
                generateCover({
                  articleId: "pending",
                  language: "zh",
                  category: task.topic.category,
                  scene: article.scene_description,
                  title: article.title,
                })
              )
            );
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(`[cover] ${task.topic.topic_key} G${task.grade} 封面生成失败: ${reason}`);
          }

          return {
            topicKey: task.topicKey,
            topic_key: task.topic.topic_key,
            grade: task.grade,
            category: task.topic.category,
            article,
            questions,
            generatedIllustrations,
            coverResult,
            pinyinContent,
            status,
            gate: {
              pass: gate.pass,
              issues: gate.issues.map((i) => i.message),
            },
            allIssues,
          } as GenerationResult;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`生成失败: ${task.topic.topic_key} G${task.grade} — ${reason}`);
          throw error;
        }
      })
  );

  // Wait for all generations to complete
  const results = await Promise.allSettled(generationPromises);

  // ---------------------------------------------------------------------------
  // Phase 3: DB operations (sequential, no concurrency needed)
  // ---------------------------------------------------------------------------

  for (const result of results) {
    if (result.status === "rejected") {
      errorCount++;
      continue;
    }

    const gen = result.value;
    const topic = tasksToProcess.find(
      (t) => t.topicKey === gen.topicKey
    )?.topic!;

    try {
      // Insert article
      const { data: articleRow, error: articleError } = await supabase
        .from("reading_articles")
        .insert({
          topic_key: gen.topicKey,
          title: gen.article.title,
          content: gen.article.content,
          language: "zh",
          pinyin_content: gen.pinyinContent,
          source: "ai_generated",
          category: gen.category,
          grade_level: gen.grade,
          word_count: gen.article.word_count,
          estimated_minutes: gen.article.estimated_minutes,
          difficulty: gen.article.difficulty,
          status: gen.status,
          summary: gen.article.summary || null,
          scene_description: gen.article.scene_description || null,
          classical_quote: gen.article.classical_quote || null,
          cover_image_url: gen.coverResult?.url ?? null,
          cover_source: gen.coverResult?.source ?? null,
          cover_source_url: gen.coverResult?.source_url ?? null,
          quality_issues: gen.allIssues.length > 0 ? gen.allIssues : null,
        })
        .select()
        .single();

      if (articleError) {
        console.error(`插入文章失败: ${articleError.message}`);
        errorCount++;
        continue;
      }

      // Update cover with real articleId if generated
      if (gen.coverResult && gen.coverResult.url) {
        try {
          const { downloadAndUploadFromUrl } = await import(
            "@/lib/reading/storage-uploader"
          );
          const { buildCoverPrompt } = await import(
            "@/lib/reading/cover-style-presets"
          );
          const { positive } = buildCoverPrompt(gen.category, gen.article.scene_description);
          const seed = Math.floor(Math.random() * 1_000_000);
          const externalUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            positive
          )}?width=800&height=533&seed=${seed}&nologo=true`;

          const upload = await downloadAndUploadFromUrl({
            externalUrl,
            path: `covers/${articleRow.id}.webp`,
          });

          await supabase
            .from("reading_articles")
            .update({
              cover_image_url: upload.url,
              cover_source_url: externalUrl,
            })
            .eq("id", articleRow.id);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[cover-reupload] ${gen.topic_key} G${gen.grade} 失败: ${reason}`);
        }
      }

      // Insert questions
      if (gen.questions.length > 0) {
        const { error: deleteQuestionsError } = await supabase
          .from("reading_questions")
          .delete()
          .eq("article_id", articleRow.id);

        if (deleteQuestionsError) {
          console.warn(`删除旧题目警告: ${deleteQuestionsError.message}`);
        }

        const questionsToInsert = gen.questions.map((q, idx) => ({
          article_id: articleRow.id,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options,
          correct_answer: q.correct_answer,
          difficulty: q.difficulty,
          order_index: idx,
        }));

        const { error: questionError } = await supabase
          .from("reading_questions")
          .insert(questionsToInsert);

        if (questionError) {
          console.error(`插入题目失败: ${questionError.message}`);
        }
      }

      // Generate and insert illustrations
      try {
        const illustrationScenes = gen.generatedIllustrations.map((ill) => ({
          paragraphIndex: ill.paragraph_index,
          sceneDescription: ill.scene_description,
        }));

        const illustrationResults = await pacer.run(() =>
          withRetry(() =>
            generateIllustrations({
              articleId: articleRow.id,
              language: "zh",
              category: gen.category,
              scenes: illustrationScenes,
            })
          )
        );

        if (illustrationResults.length > 0) {
          const { error: deleteIllustError } = await supabase
            .from("reading_article_illustrations")
            .delete()
            .eq("article_id", articleRow.id);

          if (deleteIllustError) {
            console.warn(`删除旧插图警告: ${deleteIllustError.message}`);
          }

          const illustrationsToInsert = illustrationResults.map((ill) => ({
            article_id: articleRow.id,
            paragraph_index: ill.paragraph_index,
            image_url: ill.url,
            source_url: ill.source_url,
            source: ill.source,
            scene_description:
              illustrationScenes.find(
                (s) => s.paragraphIndex === ill.paragraph_index
              )?.sceneDescription ?? null,
          }));

          const { error: illustError } = await supabase
            .from("reading_article_illustrations")
            .insert(illustrationsToInsert);

          if (illustError) {
            console.error(`插入插图失败: ${illustError.message}`);
          }
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[illustrations] ${gen.topic_key} G${gen.grade} 失败: ${reason}`);
      }

      console.log(
        `完成: ${gen.article.title} (${gen.article.word_count}字, 难度${gen.article.difficulty}, status=${gen.status})`
      );
      successCount++;
    } catch (dbError) {
      const reason = dbError instanceof Error ? dbError.message : String(dbError);
      console.error(`DB操作失败: ${gen.topic_key} G${gen.grade} — ${reason}`);
      errorCount++;
    }
  }

  console.log(
    `\n完成！成功: ${successCount}, 跳过: ${skipCount}, 失败: ${errorCount}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});