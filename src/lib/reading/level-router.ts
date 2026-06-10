// Level-router: draw an article for the child based on their current progress.
//
// Rules:
//   1. Prefer articles at the child's current level.
//   2. Exclude topics read in the last 5 articles (reading_history).
//   3. Force topic rotation after 5 consecutive reads of the same topic+level.
//   4. "challenge" mode bumps up 1 level without affecting progress stats.
//   5. "too-hard" mode re-draws at the same level (caller should not record).
//
// All DB access is best-effort with graceful fallbacks.

import { createClient } from "@/lib/supabase/server";
import type { LevelVariant, ReadingProgress } from "./progression";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DrawResult {
  topicKey: string;
  levelVariant: LevelVariant;
  ibTheme: string;
  textType: string;
  articleId: string;
  title: string;
}

export type DrawMode = "normal" | "challenge" | "too-hard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_TOPIC_EXCLUSION_COUNT = 5;
const SAME_TOPIC_LEVEL_CONSECUTIVE_LIMIT = 5;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function nextLevelVariant(lv: LevelVariant): LevelVariant | null {
  if (lv === "L1") return "L2";
  if (lv === "L2") return "L3";
  return null;
}

function prevLevelVariant(lv: LevelVariant): LevelVariant | null {
  if (lv === "L3") return "L2";
  if (lv === "L2") return "L1";
  return null;
}

// ---------------------------------------------------------------------------
// DB-backed draw
// ---------------------------------------------------------------------------

/**
 * Draw an article for the child.
 *
 * @param childId   Child UUID
 * @param progress  Current ReadingProgress (from getProgress)
 * @param mode      normal | challenge | too-hard
 */
export async function drawArticle(
  childId: string,
  progress: ReadingProgress,
  mode: DrawMode = "normal"
): Promise<DrawResult> {
  const supabase = await createClient();

  // -----------------------------------------------------------------
  // 1. Resolve target level
  // -----------------------------------------------------------------
  let targetLevel: LevelVariant = progress.currentLevel;

  if (mode === "challenge") {
    const bumped = nextLevelVariant(progress.currentLevel);
    if (bumped) targetLevel = bumped;
  } else if (mode === "too-hard") {
    const lowered = prevLevelVariant(progress.currentLevel);
    if (lowered) targetLevel = lowered;
  }

  // -----------------------------------------------------------------
  // 2. Load recent history (best-effort)
  // -----------------------------------------------------------------
  let recentHistory: Array<{
    topic_key: string;
    level_variant: string;
  }> = [];

  try {
    const { data, error } = await supabase
      .from("reading_history")
      .select("topic_key, level_variant")
      .eq("child_id", childId)
      .order("completed_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      recentHistory = data.map((h) => ({
        topic_key: String(h.topic_key ?? ""),
        level_variant: String(h.level_variant ?? ""),
      }));
    }
  } catch (e) {
    console.warn("[level-router] history query failed:", e);
  }

  // -----------------------------------------------------------------
  // 3. Build exclusion / rotation rules
  // -----------------------------------------------------------------
  const recentTopics = new Set(
    recentHistory
      .slice(0, RECENT_TOPIC_EXCLUSION_COUNT)
      .map((h) => h.topic_key)
      .filter(Boolean)
  );

  // Count consecutive same-topic+same-level reads (most-recent-first)
  const topicLevelCounts = new Map<string, number>();
  for (const h of recentHistory) {
    const key = `${h.topic_key}:${h.level_variant}`;
    const current = topicLevelCounts.get(key) ?? 0;
    if (current < SAME_TOPIC_LEVEL_CONSECUTIVE_LIMIT) {
      topicLevelCounts.set(key, current + 1);
    }
  }

  // -----------------------------------------------------------------
  // 4. Fetch candidate articles at targetLevel
  // -----------------------------------------------------------------
  // Note: reading_articles schema in generated types does not yet include
  // level_variant / ib_theme / text_type, so we select them as raw fields
  // and cast through `as unknown`.
  const { data: candidates, error: candErr } = await supabase
    .from("reading_articles")
    .select("id, title, topic_key, level_variant, ib_theme, text_type, status")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(200);

  if (candErr) {
    throw new Error(`[level-router] failed to load candidates: ${candErr.message}`);
  }

  if (!candidates || candidates.length === 0) {
    throw new Error("[level-router] no published articles available");
  }

  type RawCandidate = {
    id: string;
    title: string;
    topic_key: string;
    level_variant: string | null;
    ib_theme: string | null;
    text_type: string | null;
    status: string | null;
  };

  const typedCandidates = (candidates as unknown as RawCandidate[]).map((c) => ({
    id: c.id,
    title: c.title,
    topicKey: c.topic_key,
    levelVariant: (c.level_variant ?? "L2") as LevelVariant,
    ibTheme: c.ib_theme ?? "T1",
    textType: c.text_type ?? "non-fiction",
    status: c.status,
  }));

  // Filter to target level
  let pool = typedCandidates.filter((c) => c.levelVariant === targetLevel);

  // If pool is empty, fall back to adjacent level
  if (pool.length === 0) {
    const fallback =
      targetLevel === "L1"
        ? "L2"
        : targetLevel === "L3"
          ? "L2"
          : progress.levelStats.L1.completed > progress.levelStats.L3.completed
            ? "L3"
            : "L1";
    pool = typedCandidates.filter((c) => c.levelVariant === fallback);
    console.warn(
      `[level-router] no articles at ${targetLevel}, falling back to ${fallback}`
    );
  }

  // -----------------------------------------------------------------
  // 5. Apply exclusion / rotation filters
  // -----------------------------------------------------------------
  const eligible = pool.filter((c) => {
    // Rule 2: avoid recent 5 topics
    if (recentTopics.has(c.topicKey)) return false;

    // Rule 3: force rotation after 5 same-topic+same-level
    const tlKey = `${c.topicKey}:${c.levelVariant}`;
    const count = topicLevelCounts.get(tlKey) ?? 0;
    if (count >= SAME_TOPIC_LEVEL_CONSECUTIVE_LIMIT) return false;

    return true;
  });

  const finalPool = eligible.length > 0 ? eligible : pool;

  // -----------------------------------------------------------------
  // 6. Weighted random draw (simple uniform for now)
  // -----------------------------------------------------------------
  const pick = finalPool[Math.floor(Math.random() * finalPool.length)];

  return {
    topicKey: pick.topicKey,
    levelVariant: pick.levelVariant,
    ibTheme: pick.ibTheme,
    textType: pick.textType,
    articleId: pick.id,
    title: pick.title,
  };
}
