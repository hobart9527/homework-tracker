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

type CatLevelItem = {
  category?: string;
  level?: string;
  count: number;
  avg_accuracy: number;
};

type RecentAttempt = {
  date: string;
  article_id: string | null;
  title: string | null;
  score: number;
  total_questions: number;
  time_spent_seconds: number;
};

type DashboardRpcResult = {
  quizzes_taken: number;
  articles_read: number;
  average_accuracy: number;
  by_category: CatLevelItem[] | null;
  by_level: CatLevelItem[] | null;
  by_language: Record<string, number> | null;
  recent_attempts: RecentAttempt[] | null;
};

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

    // Aggregate via Postgres RPC instead of JS-side.
    const { data: rpcRaw, error: rpcError } = await supabase.rpc(
      "get_reading_dashboard_stats",
      {
        p_child_id: childId,
        p_start: startIso,
        p_end: endIso,
        p_recent_limit: RECENT_ACTIVITY_LIMIT,
      },
    );

    if (rpcError) {
      return NextResponse.json(
        { error: "Failed to load stats", message: rpcError.message },
        { status: 500 },
      );
    }

    const rpcData = rpcRaw as unknown as DashboardRpcResult;

    const articles_read = rpcData.articles_read;
    const quizzes_taken = rpcData.quizzes_taken;
    const average_accuracy = rpcData.average_accuracy;

    // Convert by_category array to Record<string, { count, avg_accuracy }>.
    const by_category: Record<string, { count: number; avg_accuracy: number }> =
      {};
    for (const item of rpcData.by_category ?? []) {
      if (item.category) {
        by_category[item.category] = {
          count: item.count,
          avg_accuracy: item.avg_accuracy,
        };
      }
    }

    // Convert by_level array to Record<string, { count, avg_accuracy }>.
    const by_level: Record<string, { count: number; avg_accuracy: number }> = {};
    for (const item of rpcData.by_level ?? []) {
      if (item.level) {
        by_level[item.level] = {
          count: item.count,
          avg_accuracy: item.avg_accuracy,
        };
      }
    }

    // by_language is already a Record from JSONB — extract zh/en.
    const by_language_app: Record<string, number> = rpcData.by_language ?? {};
    const by_language = {
      zh: by_language_app.zh ?? 0,
      en: by_language_app.en ?? 0,
    };

    const recent_activity = rpcData.recent_attempts ?? [];

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
      by_language,
      recent_activity,
      auto_level_history: [] as unknown[],
    };

    console.log(
      `[reading/stats/dashboard] childId=${childId} days=${days} articles_read=${articles_read} quizzes_taken=${quizzes_taken}`,
    );

    const response = NextResponse.json(responseBody);
    response.headers.set("Cache-Control", "private, max-age=30");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[reading/stats/dashboard] error:", message);
    return NextResponse.json(
      { error: "Failed to load stats", message },
      { status: 500 },
    );
  }
}
