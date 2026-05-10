// Auto-leveling pure-function evaluator for the reading system.
//
// Decides whether a child's reading level should bump up, bump down, or hold,
// based on aggregate stats (from `reading_stats`) and recent quiz attempts.
//
// Authoritative rules:
//   - Bump-up: `articles_at_current_level >= 15` AND `accuracy_streak >= 3`
//     AND currentLevel < L12 AND (no maxLevel OR currentLevel < maxLevel)
//     (RAZ rule from migration 033; per-child cap from .planning/topic-matrix-v2.md §0.1 Q3)
//   - Bump-down: last 2 attempts at currentLevel both <60% AND currentLevel > L1
//   - Otherwise: hold
//
// Pure: no DB, no fetch, no Date.now(). Caller is responsible for persistence.
// Inputs are treated as readonly.

const MIN_LEVEL_NUM = 1;
const MAX_LEVEL_NUM = 12;
const GOOD_ACCURACY = 0.8;   // >= 80% counts as a "good" attempt (streak builder)
const BAD_ACCURACY = 0.6;    // < 60% counts as a "bad" attempt (bump-down trigger)
const BUMP_UP_MIN_ARTICLES = 15;
const BUMP_UP_MIN_STREAK = 3;
const BUMP_DOWN_BAD_WINDOW = 2;

export interface AutoLevelInput {
  language: 'zh' | 'en';
  currentLevel: string;
  maxLevel?: string | null;
  recentAttempts: ReadonlyArray<{
    article_raz_level: string | null;
    score: number;
    total_questions: number;
    created_at: string;
  }>;
  stats: {
    total_articles_read: number;
    articles_at_current_level: number;
    accuracy_streak: number;
  };
}

export type AutoLevelDecision =
  | { action: 'bump_up'; from: string; to: string; reasons: string[] }
  | { action: 'bump_down'; from: string; to: string; reasons: string[] }
  | { action: 'hold'; level: string; reasons: string[] };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a level string like 'L4' into its integer component (4).
 * Returns null on malformed input — callers decide how to react.
 */
function parseRazLevel(level: string | null | undefined): number | null {
  if (!level || typeof level !== 'string') return null;
  const m = level.match(/^L(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function formatLevel(n: number): string {
  return `L${n}`;
}

function clampLevel(n: number, maxNum: number | null): number {
  let out = n;
  if (out < MIN_LEVEL_NUM) out = MIN_LEVEL_NUM;
  if (out > MAX_LEVEL_NUM) out = MAX_LEVEL_NUM;
  if (maxNum !== null && out > maxNum) out = maxNum;
  return out;
}

type AccuracyBucket = 'good' | 'neutral' | 'bad';

function bucketOf(score: number, total: number): AccuracyBucket {
  if (total <= 0) return 'neutral';
  const ratio = score / total;
  if (ratio >= GOOD_ACCURACY) return 'good';
  if (ratio < BAD_ACCURACY) return 'bad';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bump a level by ±1, clamped to [L1, L12] and to maxLevel (if provided).
 * If currentLevel is malformed, returns the original string unchanged.
 */
export function nextLevel(
  current: string,
  direction: 'up' | 'down',
  maxLevel?: string | null
): string {
  const n = parseRazLevel(current);
  if (n === null) return current;
  const maxNum = maxLevel ? parseRazLevel(maxLevel) : null;
  const delta = direction === 'up' ? 1 : -1;
  const candidate = n + delta;
  const clamped = clampLevel(candidate, maxNum);
  return formatLevel(clamped);
}

/**
 * Recompute aggregate stats from a list of attempts (most-recent-first).
 *
 *   - total_articles_read: count of all attempts (regardless of level)
 *   - articles_at_current_level: count of attempts where article_raz_level === currentLevel
 *   - accuracy_streak: number of consecutive most-recent attempts at currentLevel
 *     that are "good" (>=80%). Resets at the first non-good attempt at currentLevel.
 *     Attempts at other levels are ignored when scanning the streak.
 */
export function recomputeStats(input: {
  attempts: AutoLevelInput['recentAttempts'];
  currentLevel: string;
}): AutoLevelInput['stats'] {
  const { attempts, currentLevel } = input;
  const totalAll = attempts.length;
  const atLevel = attempts.filter((a) => a.article_raz_level === currentLevel);
  let streak = 0;
  for (const a of atLevel) {
    const b = bucketOf(a.score, a.total_questions);
    if (b === 'good') {
      streak += 1;
    } else {
      break;
    }
  }
  return {
    total_articles_read: totalAll,
    articles_at_current_level: atLevel.length,
    accuracy_streak: streak,
  };
}

/**
 * Decide whether to bump up, bump down, or hold.
 * Trusts the supplied `stats` (does NOT recompute the streak from attempts).
 * Recent attempts are only consulted for the bump-down "last 2 bad" check
 * and to format human-readable reasons.
 */
export function evaluateAutoLevel(input: AutoLevelInput): AutoLevelDecision {
  const { currentLevel, maxLevel, recentAttempts, stats } = input;

  const curNum = parseRazLevel(currentLevel);
  const maxNum = maxLevel ? parseRazLevel(maxLevel) : null;

  // Defensive: if currentLevel is malformed, hold without crashing.
  if (curNum === null) {
    return {
      action: 'hold',
      level: currentLevel,
      reasons: [`current level "${currentLevel}" is not a valid RAZ level`],
    };
  }

  // ---------------------------------------------------------------------
  // Bump-up evaluation
  // ---------------------------------------------------------------------
  const enoughArticles = stats.articles_at_current_level >= BUMP_UP_MIN_ARTICLES;
  const enoughStreak = stats.accuracy_streak >= BUMP_UP_MIN_STREAK;
  const belowCeiling = curNum < MAX_LEVEL_NUM;
  const belowMaxCap = maxNum === null || curNum < maxNum;

  if (enoughArticles && enoughStreak && belowCeiling && belowMaxCap) {
    const to = nextLevel(currentLevel, 'up', maxLevel ?? null);
    const reasons: string[] = [
      `${stats.articles_at_current_level} articles at ${currentLevel} (>= ${BUMP_UP_MIN_ARTICLES})`,
      `${stats.accuracy_streak} consecutive >=80% attempts (>= ${BUMP_UP_MIN_STREAK})`,
    ];
    if (maxNum !== null) {
      reasons.push(`below cap ${maxLevel}`);
    }
    return { action: 'bump_up', from: currentLevel, to, reasons };
  }

  // ---------------------------------------------------------------------
  // Bump-down evaluation: last 2 attempts at currentLevel both <60%.
  // We only consider attempts whose article_raz_level === currentLevel,
  // and we look at the most-recent BUMP_DOWN_BAD_WINDOW (=2) of those.
  // If fewer than 2 such attempts exist, we cannot trigger bump-down.
  // ---------------------------------------------------------------------
  const atLevelAttempts = recentAttempts.filter(
    (a) => a.article_raz_level === currentLevel
  );
  const lastTwo = atLevelAttempts.slice(0, BUMP_DOWN_BAD_WINDOW);
  const aboveFloor = curNum > MIN_LEVEL_NUM;
  const haveTwo = lastTwo.length === BUMP_DOWN_BAD_WINDOW;
  const bothBad =
    haveTwo && lastTwo.every((a) => bucketOf(a.score, a.total_questions) === 'bad');

  if (bothBad && aboveFloor) {
    const to = nextLevel(currentLevel, 'down', null);
    const ratios = lastTwo
      .map((a) => {
        const ratio =
          a.total_questions > 0 ? Math.round((a.score / a.total_questions) * 100) : 0;
        return `${a.score}/${a.total_questions} (${ratio}%)`;
      })
      .join(', ');
    return {
      action: 'bump_down',
      from: currentLevel,
      to,
      reasons: [
        `last ${BUMP_DOWN_BAD_WINDOW} attempts at ${currentLevel} both <60%: ${ratios}`,
        `above floor L${MIN_LEVEL_NUM}`,
      ],
    };
  }

  // ---------------------------------------------------------------------
  // Hold — explain *why* we did not bump.
  // ---------------------------------------------------------------------
  const reasons: string[] = [];
  if (!enoughArticles) {
    reasons.push(
      `only ${stats.articles_at_current_level} articles at ${currentLevel} (need ${BUMP_UP_MIN_ARTICLES})`
    );
  } else if (!enoughStreak) {
    reasons.push(
      `streak ${stats.accuracy_streak} (need ${BUMP_UP_MIN_STREAK})`
    );
  } else if (!belowCeiling) {
    reasons.push(`already at top level L${MAX_LEVEL_NUM}`);
  } else if (!belowMaxCap) {
    reasons.push(`at cap ${maxLevel}`);
  }
  if (haveTwo && !bothBad) {
    // Worth surfacing that recent attempts weren't both bad.
    reasons.push(`last ${BUMP_DOWN_BAD_WINDOW} attempts not both <60%`);
  } else if (!haveTwo && atLevelAttempts.length > 0) {
    reasons.push(
      `only ${atLevelAttempts.length} recent attempt(s) at ${currentLevel} (need ${BUMP_DOWN_BAD_WINDOW} for bump-down)`
    );
  }
  if (reasons.length === 0) {
    reasons.push(`hold at ${currentLevel}`);
  }
  return { action: 'hold', level: currentLevel, reasons };
}
