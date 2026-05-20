import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  generateReadingContent,
  generateCover,
  generateIllustrations,
  validateContent,
  validateIBCriteria,
  validateFactualAccuracy,
  convertToRubyPinyin,
} from "@/lib/reading";
import { decideRoute } from "@/lib/reading/route-analyzer";

// ---------------------------------------------------------------------------
// Topic source-of-truth: reading_topics table ( migrated from CURATED_NEWS )
// ---------------------------------------------------------------------------
// The previous hard-coded CURATED_NEWS array has been migrated to the
// `reading_topics` Supabase table.  This route now reads active
// topics from that table so that editorial updates no longer require a
// code deployment.
// ---------------------------------------------------------------------------

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

interface PipelineResult {
  topicKey: string;
  grade: number;
  status: string;
  articleId?: string;
  error?: string;
}

interface WorkItem {
  topic: TopicRow;
  grade: number;
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) {
        try { await fn(item); } catch (e) { /* error already logged by caller */ }
      }
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchTopics(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  language: string = "en"
): Promise<TopicRow[]> {
  const { data, error } = await supabase
    .from("reading_topics")
    .select("topic_key, category, language, source, source_text, source_url, source_image_url, target_grades")
    .eq("language", language)
    .eq("status", "active");

  if (error) {
    console.error("[refresh-news] failed to fetch topics:", error.message);
    throw new Error(`reading_topics query failed: ${error.message}`);
  }

  return (data || []) as TopicRow[];
}

async function buildWorkItems(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  grades: number[],
  limit: number,
  force: boolean
): Promise<{ items: WorkItem[]; skipped: number }> {
  const [enTopics, zhTopics] = await Promise.all([
    fetchTopics(supabase, "en"),
    fetchTopics(supabase, "zh"),
  ]);
  const topics = [...enTopics, ...zhTopics];

  const allItems: WorkItem[] = [];
  for (const topic of topics) {
    const targetGrades =
      topic.target_grades && topic.target_grades.length > 0
        ? grades.filter((g) => topic.target_grades.includes(g))
        : grades;
    for (const grade of targetGrades) {
      allItems.push({ topic, grade });
    }
  }

  let items = allItems;

  // Dedup: skip already-processed pairs unless force=true
  if (!force && items.length > 0) {
    const topicKeys = [...new Set(items.map((w) => w.topic.topic_key))];
    const { data: existing } = await supabase
      .from("reading_articles")
      .select("topic_key, grade_level")
      .in("topic_key", topicKeys);

    if (existing && existing.length > 0) {
      const existingSet = new Set(
        existing.map((e) => `${e.topic_key}:${e.grade_level}`)
      );
      items = items.filter((w) => !existingSet.has(`${w.topic.topic_key}:${w.grade}`));
    }
  }

  const skipped = allItems.length - items.length;

  if (limit > 0) {
    items = items.slice(0, limit);
  }

  return { items, skipped };
}

async function processItems(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  items: WorkItem[],
  concurrency: number,
  skipImages: boolean
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  await runWithConcurrency(items, concurrency, async (item) => {
    try {
      const result = await runPipeline(supabase, item.topic, item.grade, skipImages);
      results.push(result);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[refresh-news] pipeline error ${item.topic.topic_key} G${item.grade}:`, reason);
      results.push({
        topicKey: item.topic.topic_key,
        grade: item.grade,
        status: "error",
        error: reason,
      });
    }
  });

  return results;
}

async function runPipeline(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  topic: TopicRow,
  grade: number,
  skipImages: boolean = false
): Promise<PipelineResult> {
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

  // 1. Generate article + questions + illustration scenes
  const { article, questions, illustrations: generatedIllustrations } =
    await generateReadingContent({
      topicKey,
      language: topic.language,
      category,
      gradeLevel: grade,
      sourceText,
      route: routeDecision.route,
    });

  // 2. Quality gates
  const gate = validateContent({
    article,
    questions,
    language: topic.language,
    gradeLevel: grade,
  });
  const ibCriteria = validateIBCriteria({
    article,
    questions,
    language: topic.language,
    gradeLevel: grade,
  });
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

  const { data: articleData, error: articleError } = await supabase
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
        word_count: article.word_count,
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

  // 4. Cover image (non-blocking)
  let coverUrl: string | null = null;
  let coverSource: "minimax" | "pollinations" | "source-website" | null = null;
  let coverSourceUrl: string | null = null;

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
    hint: q.hint ?? null,
    explanation: q.explanation ?? null,
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
  if (!skipImages) {
    // Delete old illustrations first
    await supabase
      .from("reading_article_illustrations")
      .delete()
      .eq("article_id", articleId);

    if (generatedIllustrations.length > 0) {
      try {
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
  const concurrencyParam = Number(searchParams.get("concurrency")) || 3;
  const concurrency = Math.max(1, Math.min(5, concurrencyParam));
  const skipImages = searchParams.get("skip-images") === "true";
  const force = searchParams.get("force") === "true";

  let items: WorkItem[];
  let skipped: number;
  try {
    const result = await buildWorkItems(
      supabase as Awaited<ReturnType<typeof createServiceRoleClient>>,
      grades,
      limit,
      force
    );
    items = result.items;
    skipped = result.skipped;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to build work items", details: reason },
      { status: 500 }
    );
  }

  const results = await processItems(
    supabase as Awaited<ReturnType<typeof createServiceRoleClient>>,
    items,
    concurrency,
    skipImages
  );

  return NextResponse.json({
    total: results.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    skipped,
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
  const concurrencyParam: number = body.concurrency ?? 3;
  const concurrency = Math.max(1, Math.min(5, concurrencyParam));
  const skipImages: boolean = body["skip-images"] ?? body.skipImages ?? false;
  const force: boolean = body.force ?? false;

  let items: WorkItem[];
  let skipped: number;
  try {
    const result = await buildWorkItems(
      supabase as Awaited<ReturnType<typeof createServiceRoleClient>>,
      grades,
      limit,
      force
    );
    items = result.items;
    skipped = result.skipped;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to build work items", details: reason },
      { status: 500 }
    );
  }

  const results = await processItems(
    supabase as Awaited<ReturnType<typeof createServiceRoleClient>>,
    items,
    concurrency,
    skipImages
  );

  return NextResponse.json({
    total: results.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    skipped,
    results,
  });
}
