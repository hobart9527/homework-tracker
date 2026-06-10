// Mastery gate core logic for the L1/L2/L3 level-variant reading system.
//
// Decides whether a child can level-up based on completion count, accuracy,
// recent streak, and self-reported difficulty feel. Also provides helpers to
// record quiz attempts and compute per-level stats.
//
// Pure functions (checkLevelUp, computeLevelStats) have no I/O.
// Async functions (recordAttempt, getProgress) touch Supabase.

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LevelVariant = "L1" | "L2" | "L3";

export interface LevelStats {
  completed: number;
  correctRate: number;
  lastThreeRates: number[];
  avgDifficultyFeel: number;
}

export interface ReadingProgress {
  childId: string;
  currentLevel: LevelVariant;
  levelStats: Record<LevelVariant, LevelStats>;
  canLevelUp: boolean;
  canChallenge: boolean;
}

export interface AttemptRecord {
  childId: string;
  articleId: string;
  levelVariant: LevelVariant;
  correctCount: number;
  totalQuestions: number;
  difficultyFeel: number; // 1-5, 1=too hard, 5=too easy
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HARD_GATE_MIN_COMPLETED = 8;
const HARD_GATE_MIN_CORRECT_RATE = 0.75;
const SOFT_SIGNAL_RECENT_GOOD_COUNT = 2;
const SOFT_SIGNAL_RECENT_GOOD_THRESHOLD = 0.85;
const SOFT_SIGNAL_EASY_FEEL_THRESHOLD = 3; // <=3 means "easy enough"
const CHALLENGE_MIN_COMPLETED = 5;
const CHALLENGE_MIN_CORRECT_RATE = 0.6;

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Check whether a child meets the hard + soft criteria to level up.
 *
 * Hard gate: >=8 completed AND >=75% correct rate at current level.
 * Soft signal (need 1 of 2):
 *   - 2 of last 3 attempts >=85% correct
 *   - average difficulty feel <=3 (child finds it easy)
 */
export function checkLevelUp(progress: ReadingProgress): boolean {
  const stats = progress.levelStats[progress.currentLevel];
  const hardGate =
    stats.completed >= HARD_GATE_MIN_COMPLETED &&
    stats.correctRate >= HARD_GATE_MIN_CORRECT_RATE;
  const softSignal1 =
    stats.lastThreeRates.filter((r) => r >= SOFT_SIGNAL_RECENT_GOOD_THRESHOLD)
      .length >= SOFT_SIGNAL_RECENT_GOOD_COUNT;
  const softSignal2 = stats.avgDifficultyFeel <= SOFT_SIGNAL_EASY_FEEL_THRESHOLD;
  return hardGate && (softSignal1 || softSignal2);
}

/**
 * Determine whether the "challenge" button should be available.
 * Lower bar than level-up: child has some competence but hasn't met hard gate.
 */
export function checkCanChallenge(progress: ReadingProgress): boolean {
  const stats = progress.levelStats[progress.currentLevel];
  const hasSomeProgress =
    stats.completed >= CHALLENGE_MIN_COMPLETED &&
    stats.correctRate >= CHALLENGE_MIN_CORRECT_RATE;
  return hasSomeProgress && !checkLevelUp(progress);
}

/**
 * Compute per-level stats from raw history rows.
 *
 * `history` is ordered most-recent-first.
 */
export function computeLevelStats(
  history: Array<{
    level_variant: string;
    correct_count: number;
    total_questions: number;
    difficulty_feel: number;
  }>
): Record<LevelVariant, LevelStats> {
  const byLevel: Record<LevelVariant, typeof history> = {
    L1: [],
    L2: [],
    L3: [],
  };

  for (const row of history) {
    const lv = row.level_variant as LevelVariant;
    if (lv === "L1" || lv === "L2" || lv === "L3") {
      byLevel[lv].push(row);
    }
  }

  const result = {} as Record<LevelVariant, LevelStats>;
  for (const lv of ["L1", "L2", "L3"] as LevelVariant[]) {
    const rows = byLevel[lv];
    const completed = rows.length;
    const totalCorrect = rows.reduce((s, r) => s + r.correct_count, 0);
    const totalQuestions = rows.reduce((s, r) => s + r.total_questions, 0);
    const correctRate = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;
    const lastThreeRates = rows
      .slice(0, 3)
      .map((r) =>
        r.total_questions > 0 ? r.correct_count / r.total_questions : 0
      );
    const avgDifficultyFeel =
      completed > 0
        ? rows.reduce((s, r) => s + r.difficulty_feel, 0) / completed
        : 0;
    result[lv] = {
      completed,
      correctRate,
      lastThreeRates,
      avgDifficultyFeel,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Supabase-backed functions
// ---------------------------------------------------------------------------

/**
 * Record a quiz attempt into `reading_history` and return updated progress.
 *
 * Gracefully handles the case where `reading_history` does not exist yet.
 */
export async function recordAttempt(
  input: AttemptRecord
): Promise<ReadingProgress> {
  const supabase = await createClient();

  // Best-effort insert into reading_history.
  // If the table doesn't exist, log and continue.
  const { error: insertErr } = await supabase.from("reading_history").insert({
    child_id: input.childId,
    article_id: input.articleId,
    level_variant: input.levelVariant,
    correct_count: input.correctCount,
    total_questions: input.totalQuestions,
    difficulty_feel: input.difficultyFeel,
    completed_at: new Date().toISOString(),
  });

  if (insertErr) {
    console.warn("[progression] reading_history insert failed:", insertErr.message);
  }

  return getProgress(input.childId);
}

/**
 * Fetch or build a child's ReadingProgress.
 *
 * Falls back to a default L1 progress when:
 *   - reading_history table is missing
 *   - child has no history rows
 *   - child row has no current level variant stored
 */
export async function getProgress(childId: string): Promise<ReadingProgress> {
  const supabase = await createClient();

  // Attempt to load history. If the table is missing, treat as empty.
  let history: Array<{
    level_variant: string;
    correct_count: number;
    total_questions: number;
    difficulty_feel: number;
  }> = [];

  const { data: rawHistory, error: historyErr } = await supabase
    .from("reading_history")
    .select("level_variant, correct_count, total_questions, difficulty_feel")
    .eq("child_id", childId)
    .order("completed_at", { ascending: false });

  if (historyErr) {
    console.warn("[progression] reading_history query failed:", historyErr.message);
  } else {
    history = (rawHistory ?? []).map((h) => ({
      level_variant: String(h.level_variant ?? ""),
      correct_count: Number(h.correct_count ?? 0),
      total_questions: Number(h.total_questions ?? 0),
      difficulty_feel: Number(h.difficulty_feel ?? 3),
    }));
  }

  const levelStats = computeLevelStats(history);

  // Resolve current level. We store it in children.reading_level (re-purposed
  // for the variant system). Fallback to L1 if unset.
  let currentLevel: LevelVariant = "L1";
  try {
    const { data: childRow, error: childErr } = await supabase
      .from("children")
      .select("reading_level")
      .eq("id", childId)
      .single();

    if (!childErr && childRow) {
      const lv = (childRow as { reading_level?: string | null }).reading_level;
      if (lv === "L1" || lv === "L2" || lv === "L3") {
        currentLevel = lv;
      }
    }
  } catch (e) {
    console.warn("[progression] failed to load child level:", e);
  }

  const progress: ReadingProgress = {
    childId,
    currentLevel,
    levelStats,
    canLevelUp: false,
    canChallenge: false,
  };

  progress.canLevelUp = checkLevelUp(progress);
  progress.canChallenge = checkCanChallenge(progress);

  return progress;
}

/**
 * Apply a level-up (or level-down) mutation to the child's reading_level.
 */
export async function applyLevelChange(
  childId: string,
  newLevel: LevelVariant
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("children")
    .update({ reading_level: newLevel })
    .eq("id", childId);

  if (error) {
    throw new Error(`[progression] failed to update level: ${error.message}`);
  }
}
