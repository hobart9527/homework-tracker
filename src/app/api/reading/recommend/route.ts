import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  scoreRecommendations,
  parseRazLevel,
  type ArticleCandidate,
  type ChildProfile,
  type RecommendationContext,
} from "@/lib/reading/recommendation";

// Hard cap on how many candidates we score per request. Keeps in-memory
// scoring bounded even if the published-pool grows; the partial index in
// migration 039 (status, language, raz_level) makes the SQL side cheap.
const CANDIDATE_POOL_LIMIT = 100;

// Cap how many excludeIds we honor from the query string. Beyond this, the
// URL would be unwieldy and likely a client bug.
const EXCLUDE_IDS_MAX = 50;

// How many recently-completed categories we feed to the variety penalty.
const RECENT_CATEGORIES_LIMIT = 5;

type Lang = "zh" | "en";

function clampLevel(n: number): number {
  if (n < 1) return 1;
  if (n > 12) return 12;
  return n;
}

function buildLevelWindow(target: number): string[] {
  const lo = clampLevel(target - 2);
  const hi = clampLevel(target + 2);
  const out: string[] = [];
  for (let i = lo; i <= hi; i += 1) out.push(`L${i}`);
  return out;
}

import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const limited = checkRateLimit(request, 30, 60_000);
  if (limited) return limited;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const childId = searchParams.get("childId");
  const languageParam = searchParams.get("language");
  const excludeIdsParam = searchParams.get("excludeIds");

  if (!childId) {
    return NextResponse.json({ error: "Missing childId" }, { status: 400 });
  }

  // language: default 'en'; reject anything else with 400.
  let language: Lang;
  if (languageParam == null || languageParam === "") {
    language = "en";
  } else if (languageParam === "zh" || languageParam === "en") {
    language = languageParam;
  } else {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }

  // excludeIds: comma-separated, trimmed, deduped, capped.
  const excludeFromQuery: string[] = [];
  if (excludeIdsParam) {
    const seen = new Set<string>();
    for (const raw of excludeIdsParam.split(",")) {
      const v = raw.trim();
      if (!v) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      excludeFromQuery.push(v);
      if (excludeFromQuery.length >= EXCLUDE_IDS_MAX) break;
    }
  }

  try {
    // ------------------------------------------------------------------
    // 1) Existing-uncompleted-assignment branch.
    //    If the active assignment matches the requested language, return
    //    it as-is for backward compat. If the language MISMATCHES, fall
    //    through so the user can browse a recommendation in the other
    //    language without canceling their in-progress one.
    // ------------------------------------------------------------------
    const { data: assignment } = await supabase
      .from("reading_assignments")
      .select("*, article:article_id(*)")
      .eq("child_id", childId)
      .neq("status", "completed")
      .order("assigned_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeArticle = (assignment as { article?: { language?: string | null } | null } | null)
      ?.article;
    const activeArticleLang = activeArticle?.language ?? null;

    if (
      assignment &&
      activeArticle &&
      // No language column / unknown → keep legacy behavior (return it).
      (activeArticleLang == null || activeArticleLang === language)
    ) {
      return NextResponse.json({
        article: activeArticle,
        assignmentId: (assignment as { id: string }).id,
      });
    }

    // ------------------------------------------------------------------
    // 2) Auto-recommend branch.
    // ------------------------------------------------------------------

    // 2a. Load v2 child profile. Be tolerant of missing 039 columns: if
    //     the SELECT fails because a column does not exist, retry with a
    //     minimal projection so the route still responds.
    let warnedMissingColumn = false;
    const warnOnce = (msg: string) => {
      if (warnedMissingColumn) return;
      warnedMissingColumn = true;
      console.warn(`[reading/recommend] ${msg}`);
    };

    type ChildRowV2 = {
      id: string;
      reading_level_en?: string | null;
      reading_level_en_max?: string | null;
      reading_level_zh?: string | null;
      reading_level_zh_max?: string | null;
      category_priorities?: ChildProfile["category_priorities"];
      interest_signal?: ChildProfile["interest_signal"];
      last_categories?: string[] | null;
    };

    let childRow: ChildRowV2 | null = null;
    {
      const childRes = await supabase
        .from("children")
        .select(
          "id, reading_level_en, reading_level_en_max, reading_level_zh, reading_level_zh_max, category_priorities, interest_signal, last_categories",
        )
        .eq("id", childId)
        .maybeSingle();

      if (childRes.error) {
        warnOnce(
          `child v2 columns unavailable, falling back to id-only profile: ${childRes.error.message}`,
        );
        const fallback = await supabase
          .from("children")
          .select("id")
          .eq("id", childId)
          .maybeSingle();
        childRow = (fallback.data as unknown as ChildRowV2) ?? null;
      } else {
        childRow = (childRes.data as unknown as ChildRowV2) ?? null;
      }
    }

    const childProfile: ChildProfile = {
      id: childRow?.id ?? childId,
      reading_level_en: childRow?.reading_level_en ?? "L3",
      reading_level_en_max: childRow?.reading_level_en_max ?? null,
      reading_level_zh: childRow?.reading_level_zh ?? "L3",
      reading_level_zh_max: childRow?.reading_level_zh_max ?? null,
      category_priorities: childRow?.category_priorities ?? null,
      interest_signal: childRow?.interest_signal ?? null,
      last_categories: childRow?.last_categories ?? null,
    };

    // 2b. Determine target level + max for the requested language.
    const targetLevelStr =
      language === "en" ? childProfile.reading_level_en : childProfile.reading_level_zh;
    const target = parseRazLevel(targetLevelStr) ?? 3;
    const levelWindow = buildLevelWindow(target);

    // 2c. Build candidate pool. We rely on the partial index on
    //     (status, language, raz_level) for cheap selection. `as never`
    //     escape hatches handle v2 columns the generated Database types
    //     may not yet know about.
    const poolRes = await supabase
      .from("reading_articles")
      .select("*")
      .eq("status", "published")
      .eq("language", language as string)
      .not("raz_level", "is", null)
      .in("raz_level", levelWindow as string[])
      .limit(CANDIDATE_POOL_LIMIT);

    if (poolRes.error) {
      console.error("Recommend pool error:", poolRes.error);
      return NextResponse.json(
        { error: "Failed to get recommendation" },
        { status: 500 },
      );
    }

    type ArticleRowV2 = ArticleCandidate & {
      [k: string]: unknown;
    };
    const poolRows = (poolRes.data as unknown as ArticleRowV2[]) ?? [];

    // 2d. Build the excludeIds set: query param ∪ completed-assignment
    //     article ids ∪ in-progress assignment article ids in OTHER langs.
    const excludeSet = new Set<string>(excludeFromQuery);

    const completedRes = await supabase
      .from("reading_assignments")
      .select("article_id")
      .eq("child_id", childId)
      .eq("status", "completed");
    if (!completedRes.error) {
      for (const row of (completedRes.data as { article_id: string | null }[] | null) ?? []) {
        if (row.article_id) excludeSet.add(row.article_id);
      }
    }

    const inProgressRes = await supabase
      .from("reading_assignments")
      .select("article_id, article:article_id(language)")
      .eq("child_id", childId)
      .neq("status", "completed");
    if (!inProgressRes.error) {
      type IPRow = {
        article_id: string | null;
        article: { language?: string | null } | null;
      };
      for (const row of (inProgressRes.data as unknown as IPRow[] | null) ?? []) {
        if (!row.article_id) continue;
        const otherLang = row.article?.language ?? null;
        if (otherLang && otherLang !== language) {
          excludeSet.add(row.article_id);
        }
      }
    }

    // 2e. Filter candidates.
    const beforeExclude = poolRows.length;
    const filtered = poolRows.filter((a) => !excludeSet.has(a.id));
    const filteredOutByExclude = beforeExclude - filtered.length;

    // 2f. Recent categories (variety penalty input).
    const recentRes = await supabase
      .from("reading_assignments")
      .select("article:article_id(category_v2)")
      .eq("child_id", childId)
      .eq("status", "completed")
      .order("assigned_date", { ascending: false })
      .limit(RECENT_CATEGORIES_LIMIT);

    const recentReadCategories: string[] = [];
    if (!recentRes.error) {
      type RecentRow = { article: { category_v2?: string | null } | null };
      for (const row of (recentRes.data as unknown as RecentRow[] | null) ?? []) {
        const cat = row.article?.category_v2;
        if (typeof cat === "string" && cat.length > 0) {
          recentReadCategories.push(cat);
        }
      }
    }

    // 2g. Score.
    const ctx: RecommendationContext = {
      child: childProfile,
      candidates: filtered as ArticleCandidate[],
      recentReadCategories,
    };
    const scored = scoreRecommendations(ctx);
    const actionable = scored.filter((s) => !s.excluded);
    const excluded_count = filteredOutByExclude + (scored.length - actionable.length);

    if (actionable.length === 0) {
      console.log(
        `[reading/recommend] childId=${childId} language=${language} candidatePoolSize=${beforeExclude} chosenScore=null excluded_count=${excluded_count}`,
      );
      return NextResponse.json({
        article: null,
        assignmentId: null,
        excluded_count,
      });
    }

    const top = actionable[0];
    console.log(
      `[reading/recommend] childId=${childId} language=${language} candidatePoolSize=${beforeExclude} chosenScore=${top.score} excluded_count=${excluded_count}`,
    );

    return NextResponse.json({
      article: top.article,
      assignmentId: null,
      score: top.score,
      reasons: top.reasons,
      excluded_count,
    });
  } catch (error) {
    console.error("Recommend error:", error);
    return NextResponse.json(
      { error: "Failed to get recommendation" },
      { status: 500 },
    );
  }
}
