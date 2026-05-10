import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const RECENT_ACTIVITY_LIMIT = 10;

type ChildRow = {
  id: string;
  parent_id: string | null;
  reading_level_en: string | null;
  reading_level_zh: string | null;
};

type ReadingStatsRow = {
  total_articles_read: number | null;
  accuracy_streak: number | null;
};

type AttemptRow = {
  article_id: string | null;
  score: number | null;
  total_questions: number | null;
  time_spent_seconds: number | null;
  created_at: string | null;
  article: {
    id: string | null;
    title: string | null;
    category: string | null;
    category_v2: string | null;
    raz_level: string | null;
    language: string | null;
  } | null;
};

function toDateKey(iso: string | null): string {
  if (!iso) return "";
  // YYYY-MM-DD slice from ISO timestamp.
  return iso.length >= 10 ? iso.slice(0, 10) : "";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const childId = searchParams.get("childId");
  const daysParam = searchParams.get("days");

  if (!childId) {
    return NextResponse.json({ error: "Missing childId" }, { status: 400 });
  }

  let days = DEFAULT_DAYS;
  if (daysParam != null && daysParam !== "") {
    const parsed = Number(daysParam);
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < MIN_DAYS ||
      parsed > MAX_DAYS
    ) {
      return NextResponse.json({ error: "Invalid days" }, { status: 400 });
    }
    days = parsed;
  }

  // Parent-only auth: caller MUST have a parents row matching session.user.id.
  const { data: parentRow, error: parentErr } = await supabase
    .from("parents")
    .select("id")
    .eq("id", session.user.id)
    .maybeSingle();

  if (parentErr) {
    return NextResponse.json(
      { error: "Failed to load stats", message: parentErr.message },
      { status: 500 },
    );
  }

  if (!parentRow) {
    // Authenticated user is not a parent (e.g. child session). Per contract,
    // this dashboard is parent-only — return 401.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership check — childId must belong to this parent.
  const childRes = await supabase
    .from("children")
    .select("id, parent_id, reading_level_en, reading_level_zh")
    .eq("id", childId)
    .maybeSingle();

  if (childRes.error) {
    return NextResponse.json(
      { error: "Failed to load stats", message: childRes.error.message },
      { status: 500 },
    );
  }

  const child = childRes.data as unknown as ChildRow | null;

  if (!child || child.parent_id !== session.user.id) {
    return NextResponse.json({ error: "Not your child" }, { status: 403 });
  }

  // Period window.
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  try {
    // reading_stats lookup (do NOT auto-create).
    const statsRes = await supabase
      .from("reading_stats")
      .select("total_articles_read, accuracy_streak")
      .eq("child_id", childId)
      .maybeSingle();

    if (statsRes.error && statsRes.error.code !== "PGRST116") {
      return NextResponse.json(
        { error: "Failed to load stats", message: statsRes.error.message },
        { status: 500 },
      );
    }

    const stats = (statsRes.data as unknown as ReadingStatsRow | null) ?? null;

    // Quiz attempts within the period, joined with their article.
    const attemptsRes = await supabase
      .from("reading_quiz_attempts")
      .select(
        "article_id, score, total_questions, time_spent_seconds, created_at, article:article_id(id, title, category, category_v2, raz_level, language)",
      )
      .eq("child_id", childId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false });

    if (attemptsRes.error) {
      return NextResponse.json(
        { error: "Failed to load stats", message: attemptsRes.error.message },
        { status: 500 },
      );
    }

    const attempts = (attemptsRes.data as unknown as AttemptRow[] | null) ?? [];

    // Aggregate counts.
    const quizzes_taken = attempts.length;
    const distinctArticleIds = new Set<string>();
    let totalAccuracySum = 0;
    let accuracyCount = 0;

    // by_category: keyed by category_v2 first, fallback to legacy category.
    type Bucket = { count: number; accSum: number; accN: number };
    const byCategory = new Map<string, Bucket>();
    const byLevel = new Map<string, Bucket>();

    // by_language: count of distinct articles per language.
    const langArticleSets: Record<"zh" | "en", Set<string>> = {
      zh: new Set<string>(),
      en: new Set<string>(),
    };

    for (const a of attempts) {
      if (a.article_id) distinctArticleIds.add(a.article_id);

      const total = a.total_questions ?? 0;
      const score = a.score ?? 0;
      const accuracy = total > 0 ? score / total : null;
      if (accuracy !== null) {
        totalAccuracySum += accuracy;
        accuracyCount += 1;
      }

      const article = a.article;
      // Category bucket: prefer category_v2, fallback to legacy category.
      const catKey =
        (article?.category_v2 && article.category_v2.length > 0
          ? article.category_v2
          : article?.category) || null;
      if (catKey) {
        const b = byCategory.get(catKey) ?? { count: 0, accSum: 0, accN: 0 };
        b.count += 1;
        if (accuracy !== null) {
          b.accSum += accuracy;
          b.accN += 1;
        }
        byCategory.set(catKey, b);
      }

      // Level bucket.
      const lvl = article?.raz_level ?? null;
      if (lvl) {
        const b = byLevel.get(lvl) ?? { count: 0, accSum: 0, accN: 0 };
        b.count += 1;
        if (accuracy !== null) {
          b.accSum += accuracy;
          b.accN += 1;
        }
        byLevel.set(lvl, b);
      }

      // Language: count DISTINCT articles per language (not quizzes).
      const lang = article?.language ?? null;
      if (lang === "zh" || lang === "en") {
        const articleId = article?.id ?? a.article_id ?? null;
        if (articleId) langArticleSets[lang].add(articleId);
      }
    }

    const articles_read = distinctArticleIds.size;
    const average_accuracy =
      accuracyCount > 0 ? totalAccuracySum / accuracyCount : 0;

    const by_category: Record<string, { count: number; avg_accuracy: number }> =
      {};
    for (const [k, v] of byCategory.entries()) {
      by_category[k] = {
        count: v.count,
        avg_accuracy: v.accN > 0 ? v.accSum / v.accN : 0,
      };
    }

    const by_level: Record<string, { count: number; avg_accuracy: number }> =
      {};
    for (const [k, v] of byLevel.entries()) {
      by_level[k] = {
        count: v.count,
        avg_accuracy: v.accN > 0 ? v.accSum / v.accN : 0,
      };
    }

    // Recent activity: most-recent 10 attempts (already ordered desc).
    const recent_activity = attempts.slice(0, RECENT_ACTIVITY_LIMIT).map((a) => ({
      date: toDateKey(a.created_at),
      article_id: a.article_id,
      title: a.article?.title ?? null,
      score: a.score ?? 0,
      total_questions: a.total_questions ?? 0,
      time_spent_seconds: a.time_spent_seconds ?? 0,
    }));

    const responseBody = {
      child: {
        id: child.id,
        reading_level_en: child.reading_level_en ?? null,
        reading_level_zh: child.reading_level_zh ?? null,
        total_articles_read: stats?.total_articles_read ?? 0,
        accuracy_streak: stats?.accuracy_streak ?? 0,
      },
      period: {
        start: startIso,
        end: endIso,
        days,
      },
      counts: {
        articles_read,
        quizzes_taken,
        average_accuracy,
      },
      by_category,
      by_level,
      by_language: {
        zh: langArticleSets.zh.size,
        en: langArticleSets.en.size,
      },
      recent_activity,
      auto_level_history: [] as never[],
    };

    console.log(
      `[reading/stats/dashboard] childId=${childId} days=${days} articles_read=${articles_read} quizzes_taken=${quizzes_taken}`,
    );

    return NextResponse.json(responseBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[reading/stats/dashboard] error:", message);
    return NextResponse.json(
      { error: "Failed to load stats", message },
      { status: 500 },
    );
  }
}
