import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  generateReadingContent,
  generateCover,
  generateIllustrations,
  validateContent,
  validateIBCriteria,
  validateFactualAccuracy,
} from "@/lib/reading";

// ---------------------------------------------------------------------------
// Topic source-of-truth: reading_topics table ( migrated from CURATED_NEWS )
// ---------------------------------------------------------------------------
// The previous hard-coded CURATED_NEWS array has been migrated to the
// `reading_topics` Supabase table.  This route now reads active English
// topics from that table so that editorial updates no longer require a
// code deployment.
// ---------------------------------------------------------------------------

interface TopicRow {
  topic_key: string;
  category: string;
  source_text: string | null;
  source_url: string | null;
  target_grades: number[];
}

interface PipelineResult {
  topicKey: string;
  grade: number;
  status: string;
  articleId?: string;
  error?: string;
}

async function fetchTopics(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>): Promise<TopicRow[]> {
  const { data, error } = await supabase
    .from("reading_topics")
    .select("topic_key, category, source_text, source_url, target_grades")
    .eq("language", "en")
    .eq("status", "active");

  if (error) {
    console.error("[refresh-news] failed to fetch topics:", error.message);
    throw new Error(`reading_topics query failed: ${error.message}`);
  }

  return (data || []) as TopicRow[];
}

async function runPipeline(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  topic: TopicRow,
  grade: number
): Promise<PipelineResult> {
  const topicKey = topic.topic_key;
  const category = topic.category;
  const sourceText = topic.source_text || "";
  const sourceUrl = topic.source_url;

  // 1. Generate article + questions + illustration scenes
  const { article, questions, illustrations: generatedIllustrations } =
    await generateReadingContent({
      topicKey,
      language: "en",
      category,
      gradeLevel: grade,
      sourceText,
    });

  // 2. Quality gates
  const gate = validateContent({
    article,
    questions,
    language: "en",
    gradeLevel: grade,
  });
  const ibCriteria = validateIBCriteria({
    article,
    questions,
    language: "en",
    gradeLevel: grade,
  });
  const factualCriteria = validateFactualAccuracy({
    article,
    sourceText: topic.source_text || undefined,
    language: "en",
    gradeLevel: grade,
  });

  const articleStatus = gate.pass && ibCriteria.pass && factualCriteria.pass ? "published" : "draft";

  // 3. Upsert article
  const { data: articleData, error: articleError } = await supabase
    .from("reading_articles")
    .upsert(
      {
        topic_key: topicKey,
        title: article.title,
        content: article.content,
        source: "news_api",
        source_url: sourceUrl || null,
        category,
        grade_level: grade,
        word_count: article.word_count,
        estimated_minutes: article.estimated_minutes,
        difficulty: article.difficulty,
        status: articleStatus,
        scene_description: article.scene_description || null,
        quality_issues: [...gate.issues, ...ibCriteria.issues, ...factualCriteria.issues].length > 0
          ? [...gate.issues, ...ibCriteria.issues, ...factualCriteria.issues]
          : null,
      },
      { onConflict: "topic_key,grade_level" }
    )
    .select("id")
    .single();

  if (articleError) {
    throw new Error(`article upsert failed: ${articleError.message}`);
  }

  const articleId = articleData.id;

  // 4. Cover image (non-blocking)
  let coverUrl: string | null = null;
  let coverSource: "minimax" | "pollinations" | null = null;
  let coverSourceUrl: string | null = null;

  try {
    const cover = await generateCover({
      articleId,
      language: "en",
      category,
      scene: article.scene_description || article.title,
      title: article.title,
    });
    coverUrl = cover.url;
    coverSource = cover.source;
    coverSourceUrl = cover.source_url;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[refresh-news] cover generation failed for ${topicKey} G${grade}: ${reason}`);
    // non-blocking: continue without cover
  }

  // 5. Update article with cover info if cover succeeded
  if (coverUrl) {
    const { error: coverUpdateError } = await supabase
      .from("reading_articles")
      .update({
        cover_url: coverUrl,
        cover_source: coverSource,
        cover_source_url: coverSourceUrl,
      })
      .eq("id", articleId);

    if (coverUpdateError) {
      console.warn(
        `[refresh-news] cover update failed for ${topicKey} G${grade}: ${coverUpdateError.message}`
      );
    }
  }

  // 6. Questions: delete old + insert new
  await supabase.from("reading_questions").delete().eq("article_id", articleId);

  const questionRows = questions.map((q, i) => ({
    article_id: articleId,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.options,
    correct_answer: q.correct_answer,
    difficulty: q.difficulty,
    order_index: i,
  }));

  if (questionRows.length > 0) {
    const { error: qError } = await supabase
      .from("reading_questions")
      .insert(questionRows);

    if (qError) {
      console.warn(
        `[refresh-news] question insert failed for ${topicKey} G${grade}: ${qError.message}`
      );
    }
  }

  // 7. Illustrations (non-blocking)
  // Delete old illustrations first
  await supabase
    .from("reading_article_illustrations")
    .delete()
    .eq("article_id", articleId);

  if (generatedIllustrations.length > 0) {
    try {
      const illustrationResults = await generateIllustrations({
        articleId,
        language: "en",
        category,
        scenes: generatedIllustrations.map((ill) => ({
          paragraphIndex: ill.paragraph_index,
          sceneDescription: ill.scene_description,
        })),
      });

      if (illustrationResults.length > 0) {
        const illustrationRows = illustrationResults.map((ill) => ({
          article_id: articleId,
          paragraph_index: ill.paragraph_index,
          image_url: ill.url,
          source_url: ill.source_url,
          source: ill.source,
          scene_description:
            generatedIllustrations.find(
              (g) => g.paragraph_index === ill.paragraph_index
            )?.scene_description || null,
        }));

        const { error: illError } = await supabase
          .from("reading_article_illustrations")
          .insert(illustrationRows);

        if (illError) {
          console.warn(
            `[refresh-news] illustration insert failed for ${topicKey} G${grade}: ${illError.message}`
          );
        }
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[refresh-news] illustration generation failed for ${topicKey} G${grade}: ${reason}`
      );
      // non-blocking: continue without illustrations
    }
  }

  return {
    topicKey,
    grade,
    status: "ok",
    articleId,
  };
}

export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  const isCronCall =
    !!cronSecret && cronSecret === (process.env.CRON_SECRET || "");

  const supabase = isCronCall
    ? await createServiceRoleClient()
    : await createClient();

  if (!isCronCall) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const gradesParam = searchParams.get("grades") || "3,6";
  const grades: number[] = gradesParam
    .split(",")
    .map(Number)
    .filter((n) => !isNaN(n));
  const limit = Number(searchParams.get("limit")) || 0;

  let topics: TopicRow[];
  try {
    topics = await fetchTopics(supabase as Awaited<ReturnType<typeof createServiceRoleClient>>);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to fetch topics", details: reason },
      { status: 500 }
    );
  }

  const items = limit > 0 ? topics.slice(0, limit) : topics;
  const results: PipelineResult[] = [];

  for (const topic of items) {
    // Use requested grades intersected with topic's target_grades
    const targetGrades =
      topic.target_grades && topic.target_grades.length > 0
        ? grades.filter((g) => topic.target_grades.includes(g))
        : grades;

    for (const grade of targetGrades) {
      try {
        const result = await runPipeline(
          supabase as Awaited<ReturnType<typeof createServiceRoleClient>>,
          topic,
          grade
        );
        results.push(result);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[refresh-news] pipeline error ${topic.topic_key} G${grade}:`, reason);
        results.push({
          topicKey: topic.topic_key,
          grade,
          status: "error",
          error: reason,
        });
      }
    }
  }

  return NextResponse.json({
    total: results.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const grades: number[] = body.grades || [3, 6];
  const limit: number = body.limit || 0;

  let topics: TopicRow[];
  try {
    topics = await fetchTopics(supabase as Awaited<ReturnType<typeof createServiceRoleClient>>);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to fetch topics", details: reason },
      { status: 500 }
    );
  }

  const items = limit > 0 ? topics.slice(0, limit) : topics;
  const results: PipelineResult[] = [];

  for (const topic of items) {
    const targetGrades =
      topic.target_grades && topic.target_grades.length > 0
        ? grades.filter((g) => topic.target_grades.includes(g))
        : grades;

    for (const grade of targetGrades) {
      try {
        const result = await runPipeline(
          supabase as Awaited<ReturnType<typeof createServiceRoleClient>>,
          topic,
          grade
        );
        results.push(result);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[refresh-news] pipeline error ${topic.topic_key} G${grade}:`, reason);
        results.push({
          topicKey: topic.topic_key,
          grade,
          status: "error",
          error: reason,
        });
      }
    }
  }

  return NextResponse.json({
    total: results.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  });
}
