/**
 * POST /api/reading/news/submit
 *
 * Parent-initiated news submission endpoint (W1-task-2).
 *
 * Pipeline: parent submits a news URL + grade levels →
 *   1. Auth: parent session via SSR Supabase client; row in `parents` required.
 *   2. Validate body { url, gradeLevels[], freshnessDays? }.
 *   3. Fetch + extract main text via news-fetcher (frozen W1-task-1).
 *   4. Upsert one reading_topics row (category_v2='时事', freshness window).
 *   5. For each grade: generateReadingContent → validateContent (quality gate)
 *      → upsert reading_articles → replace reading_questions.
 *   6. Per-grade failures captured in `failed[]`; do not abort the batch.
 *
 * No image generation here (covers/illustrations) — reading-content-pipeline
 * can backfill later. No CRON_SECRET (parent-initiated).
 *
 * Frozen response shape:
 *   200 → { topic_key, article_ids, generated_count, failed? }
 *   400 → { error: 'invalid_url'|'missing_field'|'too_short'|'too_long', message }
 *   401 → { error: 'unauthorized', message }
 *   500 → { error: 'fetch_failed'|'generation_failed', message }
 */

import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { generateReadingContent, validateContent } from "@/lib/reading";
import {
  fetchAndExtract,
  NewsFetchError,
  type NewsFetchErrorCode,
} from "@/lib/reading/news-fetcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubmitBody {
  url?: unknown;
  gradeLevels?: unknown;
  freshnessDays?: unknown;
}

interface FailedGrade {
  gradeLevel: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY = "current";
const CATEGORY_V2 = "时事";
const LANGUAGE = "en" as const;
const SOURCE = "parent_news";
const SOURCE_TEXT_MAX = 6000;
const DEFAULT_FRESHNESS_DAYS = 30;
const MIN_FRESHNESS_DAYS = 1;
const MAX_FRESHNESS_DAYS = 365;
const MIN_GRADE = 1;
const MAX_GRADE = 12;

function nowPlusDaysIso(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function todayYmd(): string {
  // YYYY-MM-DD in UTC; stable for cross-timezone topic_key collisions.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * shortHash: first 8 hex chars of sha256(`${url}|${epochSeconds}`).
 * Web Crypto API is available in the Next.js Node runtime.
 */
async function shortHash(url: string): Promise<string> {
  const seed = `${url}|${Math.floor(Date.now() / 1000)}`;
  const data = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex; // 8 hex chars
}

function isIntegerInRange(n: unknown, min: number, max: number): boolean {
  return (
    typeof n === "number" && Number.isInteger(n) && n >= min && n <= max
  );
}

function parseUrlOrNull(value: unknown): URL | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function mapFetchErrorToHttp(code: NewsFetchErrorCode): {
  status: number;
  errorCode: string;
} {
  switch (code) {
    case "invalid_url":
    case "invalid_content_type":
      return { status: 400, errorCode: "invalid_url" };
    case "too_short":
      return { status: 400, errorCode: "too_short" };
    case "too_long":
      return { status: 400, errorCode: "too_long" };
    case "http_error":
    case "network_timeout":
    default:
      return { status: 500, errorCode: "fetch_failed" };
  }
}

function truncate(s: string, max = 500): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // --- 1. Auth (SSR client; do NOT use service role for the auth read) ---
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "unauthorized", message: "未登录或会话已过期。" },
        { status: 401 },
      );
    }

    const { data: parentRow } = await supabase
      .from("parents")
      .select("id")
      .eq("id", session.user.id)
      .single();

    if (!parentRow) {
      return NextResponse.json(
        { error: "unauthorized", message: "当前账号不是家长账号。" },
        { status: 401 },
      );
    }

    // --- 2. Body validation ---
    let body: SubmitBody;
    try {
      body = (await request.json()) as SubmitBody;
    } catch {
      return NextResponse.json(
        { error: "missing_field", message: "请求体不是合法的 JSON。" },
        { status: 400 },
      );
    }

    const parsedUrl = parseUrlOrNull(body.url);
    if (!parsedUrl) {
      // missing or unparsable
      if (typeof body.url !== "string" || body.url.trim().length === 0) {
        return NextResponse.json(
          { error: "missing_field", message: "缺少 url 字段。" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "invalid_url", message: "URL 格式无效或协议不被支持。" },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.gradeLevels) || body.gradeLevels.length === 0) {
      return NextResponse.json(
        { error: "missing_field", message: "缺少 gradeLevels 字段或为空。" },
        { status: 400 },
      );
    }
    const gradeLevels: number[] = [];
    for (const g of body.gradeLevels) {
      if (!isIntegerInRange(g, MIN_GRADE, MAX_GRADE)) {
        return NextResponse.json(
          {
            error: "missing_field",
            message: `gradeLevels 包含无效值：${String(g)}（必须为 1-12 整数）。`,
          },
          { status: 400 },
        );
      }
      gradeLevels.push(g as number);
    }

    let freshnessDays = DEFAULT_FRESHNESS_DAYS;
    if (body.freshnessDays !== undefined) {
      if (
        !isIntegerInRange(body.freshnessDays, MIN_FRESHNESS_DAYS, MAX_FRESHNESS_DAYS)
      ) {
        return NextResponse.json(
          {
            error: "missing_field",
            message: "freshnessDays 必须是 1-365 之间的整数。",
          },
          { status: 400 },
        );
      }
      freshnessDays = body.freshnessDays as number;
    }

    // --- 3. Fetch + extract ---
    let extracted;
    try {
      extracted = await fetchAndExtract(parsedUrl.toString());
    } catch (err) {
      if (err instanceof NewsFetchError) {
        const { status, errorCode } = mapFetchErrorToHttp(err.code);
        console.log(
          `[news/submit] fetch failed code=${err.code} url_host=${parsedUrl.host}`,
        );
        return NextResponse.json(
          { error: errorCode, message: err.message },
          { status },
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[news/submit] unexpected fetch error: ${msg}`);
      return NextResponse.json(
        { error: "fetch_failed", message: truncate(msg) },
        { status: 500 },
      );
    }

    // --- 4. Topic upsert (service-role client for write) ---
    const service = await createServiceRoleClient();

    const topicKey = `news-${todayYmd()}-${await shortHash(extracted.url)}`;
    const sourceText = extracted.text.slice(0, SOURCE_TEXT_MAX);
    const recommendedLevels = gradeLevels.map((g) => `L${g}`);
    const freshnessUntil = nowPlusDaysIso(freshnessDays);

    // reading_topics has v2 columns (category_v2, freshness_until,
    // recommended_levels) that may not exist in the generated Database
    // types. Cast through `unknown as never` per archive-stale-news pattern.
    const topicRow = {
      topic_key: topicKey,
      language: LANGUAGE,
      category: CATEGORY,
      category_v2: CATEGORY_V2,
      source_text: sourceText,
      source_url: extracted.url,
      target_grades: gradeLevels,
      recommended_levels: recommendedLevels,
      freshness_until: freshnessUntil,
      status: "active",
    };

    const { error: topicErr } = await service
      .from("reading_topics")
      .upsert(topicRow as never, { onConflict: "topic_key,language" });

    if (topicErr) {
      console.error(`[news/submit] topic upsert failed: ${topicErr.message}`);
      return NextResponse.json(
        {
          error: "generation_failed",
          message: `topic upsert failed: ${truncate(topicErr.message)}`,
        },
        { status: 500 },
      );
    }

    // --- 5. Per-grade article generation ---
    const articleIds: string[] = [];
    const failed: FailedGrade[] = [];

    for (const gradeLevel of gradeLevels) {
      try {
        const { article, questions } = await generateReadingContent({
          topicKey,
          language: LANGUAGE,
          category: CATEGORY,
          gradeLevel,
          sourceText: extracted.text,
          recommendedLevels: [`L${gradeLevel}`],
          packId: undefined,
          packOrder: undefined,
        });

        const gate = validateContent({
          article,
          questions,
          language: LANGUAGE,
          gradeLevel,
        });

        const articleStatus = gate.pass ? "published" : "draft";

        const articleRow = {
          topic_key: topicKey,
          title: article.title,
          content: article.content,
          summary: article.summary || null,
          source: SOURCE,
          source_url: extracted.url,
          category: CATEGORY,
          grade_level: gradeLevel,
          language: LANGUAGE,
          word_count: article.word_count,
          estimated_minutes: article.estimated_minutes,
          difficulty: article.difficulty,
          status: articleStatus,
          scene_description: article.scene_description || null,
          quality_issues: gate.issues.length > 0 ? gate.issues : null,
        };

        const { data: articleData, error: articleErr } = await service
          .from("reading_articles")
          .upsert(articleRow as never, { onConflict: "topic_key,grade_level" })
          .select("id")
          .single();

        if (articleErr || !articleData) {
          throw new Error(
            articleErr?.message || "reading_articles upsert returned no row",
          );
        }

        const articleId = (articleData as { id: string }).id;

        // Replace questions for this article.
        await service
          .from("reading_questions")
          .delete()
          .eq("article_id", articleId);

        if (questions.length > 0) {
          const questionRows = questions.map((q, i) => ({
            article_id: articleId,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options,
            correct_answer: q.correct_answer,
            difficulty: q.difficulty,
            order_index: i,
          }));

          const { error: qErr } = await service
            .from("reading_questions")
            .insert(questionRows as never);

          if (qErr) {
            // Question insert failure should NOT lose the article — log and
            // continue. Treat the grade as succeeded since the article landed.
            console.warn(
              `[news/submit] question insert failed for ${topicKey} G${gradeLevel}: ${qErr.message}`,
            );
          }
        }

        articleIds.push(articleId);
        console.log(
          `[news/submit] generated topic=${topicKey} grade=${gradeLevel} status=${articleStatus} article_id=${articleId}`,
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(
          `[news/submit] generation failed topic=${topicKey} grade=${gradeLevel}: ${reason}`,
        );
        failed.push({ gradeLevel, reason: truncate(reason, 300) });
        // continue with next grade
      }
    }

    // --- 6. Response ---
    const response: {
      topic_key: string;
      article_ids: string[];
      generated_count: number;
      failed?: FailedGrade[];
    } = {
      topic_key: topicKey,
      article_ids: articleIds,
      generated_count: articleIds.length,
    };
    if (failed.length > 0) {
      response.failed = failed;
    }
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[news/submit] unhandled error: ${reason}`);
    return NextResponse.json(
      { error: "generation_failed", message: truncate(reason) },
      { status: 500 },
    );
  }
}
