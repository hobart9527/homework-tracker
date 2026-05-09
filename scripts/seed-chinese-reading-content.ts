#!/usr/bin/env tsx
/**
 * Seed Chinese Graded Reading Content
 * 从 reading_topics 表读取中文主题，通过统一管线生成文章。
 *
 * Usage: npx tsx scripts/seed-chinese-reading-content.ts
 * 需要环境变量: OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Dynamic imports after dotenv config so env vars are available.
  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const {
    generateReadingContent,
    convertToRubyPinyin,
    generateCover,
    generateIllustrations,
    validateContent,
  } = await import("@/lib/reading");

  const supabase = await createServiceRoleClient();

  // ---------------------------------------------------------------------------
  // Fetch active Chinese topics from reading_topics
  // ---------------------------------------------------------------------------

  const { data: topics, error: topicsError } = await supabase
    .from("reading_topics")
    .select("topic_key, category, target_grades")
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

  const RATE_LIMIT_MS = 1500;

  for (const topic of topics) {
    const grades: number[] =
      topic.target_grades && topic.target_grades.length > 0
        ? topic.target_grades
        : [3, 5];

    for (const grade of grades) {
      const topicKey = `${topic.topic_key}-G${grade}`;

      // Check if already exists
      const { data: existing } = await supabase
        .from("reading_articles")
        .select("id")
        .eq("topic_key", topicKey)
        .eq("language", "zh")
        .maybeSingle();

      if (existing) {
        console.log(`已存在，跳过: ${topic.topic_key} G${grade}`);
        skipCount++;
        continue;
      }

      console.log(`生成中: ${topic.topic_key} G${grade}...`);

      try {
        // 1. Generate content via unified pipeline
        const { article, questions, illustrations: generatedIllustrations } =
          await generateReadingContent({
            topicKey: topic.topic_key,
            language: "zh",
            category: topic.category,
            gradeLevel: grade,
          });

        // 2. Post-process pinyin (do NOT ask LLM for pinyin)
        const pinyinContent = convertToRubyPinyin(article.content);

        // 3. Quality gate
        const gate = validateContent({
          article,
          questions,
          language: "zh",
          gradeLevel: grade,
        });

        const status = gate.pass ? "published" : "draft";

        // 4. Generate cover (non-blocking failure)
        let coverResult: Awaited<ReturnType<typeof generateCover>> | null = null;
        try {
          coverResult = await generateCover({
            articleId: "pending", // placeholder; replaced after insert
            language: "zh",
            category: topic.category,
            scene: article.scene_description,
            title: article.title,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[cover] ${topic.topic_key} G${grade} 封面生成失败: ${reason}`);
        }

        // 5. Insert article
        const { data: articleRow, error: articleError } = await supabase
          .from("reading_articles")
          .insert({
            topic_key: topicKey,
            title: article.title,
            content: article.content,
            language: "zh",
            pinyin_content: pinyinContent,
            source: "ai_generated",
            category: topic.category,
            grade_level: grade,
            word_count: article.word_count,
            estimated_minutes: article.estimated_minutes,
            difficulty: article.difficulty,
            status,
            summary: article.summary || null,
            scene_description: article.scene_description || null,
            classical_quote: article.classical_quote || null,
            cover_image_url: coverResult?.url ?? null,
            cover_source: coverResult?.source ?? null,
            cover_source_url: coverResult?.source_url ?? null,
            quality_issues: gate.issues.length > 0 ? gate.issues : null,
          })
          .select()
          .single();

        if (articleError) {
          console.error(`插入文章失败: ${articleError.message}`);
          errorCount++;
          continue;
        }

        // 6. Update cover with real articleId if generated
        if (coverResult && coverResult.url) {
          try {
            // Re-upload cover with correct articleId path
            const { downloadAndUploadFromUrl } = await import(
              "@/lib/reading/storage-uploader"
            );
            const { buildCoverPrompt } = await import(
              "@/lib/reading/cover-style-presets"
            );
            const { positive } = buildCoverPrompt(topic.category, article.scene_description);
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
            console.warn(`[cover-reupload] ${topic.topic_key} G${grade} 失败: ${reason}`);
          }
        }

        // 7. Insert questions (replace-style)
        if (questions.length > 0) {
          const { error: deleteQuestionsError } = await supabase
            .from("reading_questions")
            .delete()
            .eq("article_id", articleRow.id);

          if (deleteQuestionsError) {
            console.warn(`删除旧题目警告: ${deleteQuestionsError.message}`);
          }

          const questionsToInsert = questions.map((q, idx) => ({
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

        // 8. Generate and insert illustrations (non-blocking failure)
        try {
          const illustrationScenes = generatedIllustrations.map((ill) => ({
            paragraphIndex: ill.paragraph_index,
            sceneDescription: ill.scene_description,
          }));

          const illustrationResults = await generateIllustrations({
            articleId: articleRow.id,
            language: "zh",
            category: topic.category,
            scenes: illustrationScenes,
          });

          if (illustrationResults.length > 0) {
            // Replace-style: delete old then insert new
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
          console.warn(`[illustrations] ${topic.topic_key} G${grade} 失败: ${reason}`);
        }

        console.log(
          `完成: ${article.title} (${article.word_count}字, 难度${article.difficulty}, status=${status})`
        );
        successCount++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`生成失败: ${topic.topic_key} G${grade} — ${reason}`);
        errorCount++;
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
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
