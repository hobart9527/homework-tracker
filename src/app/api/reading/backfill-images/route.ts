import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { generateCover, generateIllustrations } from "@/lib/reading";

// ---------------------------------------------------------------------------
// Backfill missing cover images and illustrations for existing articles.
// Processes articles with concurrency=1 to protect MiniMax daily quota.
// ---------------------------------------------------------------------------

interface BackfillStats {
  totalProcessed: number;
  coversFixed: number;
  illustrationsFixed: number;
  errors: { articleId: string; reason: string }[];
}

type SupabaseClient = Awaited<ReturnType<typeof createServiceRoleClient>>;
type ArticleRow = {
  id: string;
  title: string;
  language: string;
  category: string;
  scene_description: string | null;
  cover_image_url: string | null;
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Find all articles that need backfill: missing cover_image_url OR
 * have zero reading_article_illustrations records.
 * Optional ?limit truncates the result set.
 */
async function getArticlesToProcess(
  supabase: SupabaseClient,
  limit: number
): Promise<ArticleRow[]> {
  // 1. Get IDs of articles that already have illustrations (cap at 1000)
  const { data: illData, error: illErr } = await supabase
    .from("reading_article_illustrations")
    .select("article_id")
    .limit(1000);

  if (illErr) {
    throw new Error(
      `reading_article_illustrations query failed: ${illErr.message}`
    );
  }

  const idsWithIllustrations = new Set(
    (illData || []).map((r) => r.article_id)
  );

  // 2. Query articles needing cover backfill, excluding those with illustrations
  let query = supabase
    .from("reading_articles")
    .select(
      "id, title, language, category, scene_description, cover_image_url"
    )
    .or("cover_image_url.is.null,cover_image_url.ilike.%pending.webp");

  if (idsWithIllustrations.size > 0) {
    query = query.not("id", "in", [...idsWithIllustrations]);
  }

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: articles, error: articlesErr } = await query;

  if (articlesErr) {
    throw new Error(
      `reading_articles query failed: ${articlesErr.message}`
    );
  }

  return articles || [];
}

// ---------------------------------------------------------------------------
// Article processing (concurrency=1 — one article at a time)
// ---------------------------------------------------------------------------

/**
 * Attempt to fix covers and/or illustrations for a single article.
 * Each step is independently non-blocking: failures log a warning and
 * processing continues to the next step / next article.
 */
async function processArticle(
  supabase: SupabaseClient,
  article: ArticleRow,
  stats: BackfillStats
): Promise<void> {
  const articleId = article.id;
  const language: "zh" | "en" =
    article.language === "zh" ? "zh" : "en";

  // ---- 1. Cover backfill (null or placeholder pending.webp) ---------------
  if (!article.cover_image_url || article.cover_image_url.endsWith("pending.webp")) {
    try {
      const cover = await generateCover({
        articleId,
        language,
        category: article.category,
        scene: article.scene_description || article.title,
        title: article.title,
      });

      const { error: updateErr } = await supabase
        .from("reading_articles")
        .update({
          cover_image_url: cover.url,
          cover_source: cover.source,
          cover_source_url: cover.source_url,
        })
        .eq("id", articleId);

      if (updateErr) {
        console.warn(
          `[backfill-images] cover update failed for ${articleId}: ${updateErr.message}`
        );
      } else {
        stats.coversFixed++;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[backfill-images] cover generation failed for ${articleId}: ${reason}`
      );
      // non-blocking — continue to illustrations
    }
  }

  // ---- 2. Illustration backfill (only if scene_description exists) ------
  if (!article.scene_description) return;

  const { count, error: countErr } = await supabase
    .from("reading_article_illustrations")
    .select("*", { count: "exact", head: true })
    .eq("article_id", articleId);

  if (countErr) {
    console.warn(
      `[backfill-images] illustration count failed for ${articleId}: ${countErr.message}`
    );
    return;
  }

  if (count! > 0) return; // already has illustrations

  try {
    const illustrationResults = await generateIllustrations({
      articleId,
      language,
      category: article.category,
      scenes: [
        {
          paragraphIndex: 0,
          sceneDescription: article.scene_description,
        },
      ],
    });

    if (illustrationResults.length > 0) {
      // Normalize source to match DB CHECK constraint (minimax|pollinations)
      // Illustration generator never returns "minimax"; all sources map to "pollinations"
      const rows = illustrationResults.map((ill) => ({
        article_id: articleId,
        paragraph_index: ill.paragraph_index,
        image_url: ill.url,
        source_url: ill.source_url,
        source: "pollinations" as const,
        scene_description: article.scene_description,
      }));

      const { error: insertErr } = await supabase
        .from("reading_article_illustrations")
        .insert(rows);

      if (insertErr) {
        console.warn(
          `[backfill-images] illustration insert failed for ${articleId}: ${insertErr.message}`
        );
      } else {
        stats.illustrationsFixed++;
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[backfill-images] illustration generation failed for ${articleId}: ${reason}`
    );
    // non-blocking — continue to next article
  }
}

// ---------------------------------------------------------------------------
// Shared request handler
// ---------------------------------------------------------------------------

async function handleRequest(
  supabase: SupabaseClient,
  limit: number
): Promise<BackfillStats> {
  const articles = await getArticlesToProcess(supabase, limit);

  const stats: BackfillStats = {
    totalProcessed: 0,
    coversFixed: 0,
    illustrationsFixed: 0,
    errors: [],
  };

  // Concurrency = 1: process sequentially to protect MiniMax daily quota
  for (const article of articles) {
    stats.totalProcessed++;
    try {
      await processArticle(supabase, article, stats);
    } catch (err) {
      // processArticle already catches internal errors; this catches
      // unexpected failures (e.g. DB connection dropped mid-query)
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[backfill-images] article ${article.id} unexpected error: ${reason}`
      );
      stats.errors.push({ articleId: article.id, reason });
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET  —  x-cron-secret header (service role) or session auth.
 * Query params: ?limit=N
 */
export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  const cronSecretEnv = process.env.CRON_SECRET;
  const isCronCall =
    !!cronSecret && !!cronSecretEnv && cronSecret === cronSecretEnv;

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
  const limit = Number(searchParams.get("limit")) || 0;

  try {
    const stats = await handleRequest(
      supabase as SupabaseClient,
      limit
    );
    return NextResponse.json(stats);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to process backfill", details: reason },
      { status: 500 }
    );
  }
}

/**
 * POST  —  session auth required. Body: { limit?: number }
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit: number = body.limit || 0;

  try {
    const stats = await handleRequest(
      supabase as SupabaseClient,
      limit
    );
    return NextResponse.json(stats);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to process backfill", details: reason },
      { status: 500 }
    );
  }
}
