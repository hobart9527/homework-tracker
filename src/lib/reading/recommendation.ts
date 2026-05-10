// Pure-function recommendation scoring library for the per-child reading
// system. Ranks candidate articles by combining level match, category
// priorities, interest signal, variety penalty, freshness, and audio
// readiness. NO I/O — no DB calls, no fetch, no global Date.now() inside the
// scoring path.
//
// Scoring formula (additive, then clamped to [0, 100]):
//   1. Base score                                          = 50
//   2. Level match (+30 / +20 / +5 / -10 / -30 hard cap)   ±0..30
//   3. Category priority (高 +15, 中 +5, 低 -5)             ±0..15
//   4. Interest signal (clamp(interest * 10, 0, 10))       +0..10
//   5. Variety penalty (1 occurrence -7, 2+ occurrences -15) -0..15
//   6. Freshness bonus (≥14d +10, 7..13 +6, 1..6 +3, evergreen 0) +0..10
//   7. Pack continuity bonus — TODO v2 (not implemented; see notes)
//   8. Audio readiness bonus (zh + audio_zh_url) → +3       +0..3
//
// Exclusion rules (the article is still returned in the result with
// `excluded` set, score forced to 0, and pushed to the bottom):
//   A. wrong_language  — article.language doesn't match the child's
//      reading_level for that language (only triggered for mixed-language
//      candidate pools where the relevant child level is missing/empty)
//   B. age_gate        — article.age_min_level set, child's level for
//      article.language is below it
//   C. expired         — article.freshness_until set and now > freshness_until
//   D. already_read_recently — RESERVED. The scoring lib does NOT receive a
//      "recently read article ids" list in v1; article-level dedupe lives in
//      the API/route layer. Variety penalty (#5) approximates this at the
//      category level.
//
// Tie-break: descending score → descending difficulty (more challenging
// first) → topic_key alphabetical ascending.

export interface ChildProfile {
  id: string;
  reading_level_en: string; // e.g., 'L4'
  reading_level_en_max?: string | null;
  reading_level_zh: string;
  reading_level_zh_max?: string | null;
  category_priorities?: { 高?: string[]; 中?: string[]; 低?: string[] } | null;
  interest_signal?: Record<string, number> | null;
  last_categories?: string[] | null;
}

export interface ArticleCandidate {
  id: string;
  topic_key: string;
  title: string;
  language: "zh" | "en";
  category: string;
  category_v2?: string | null;
  raz_level?: string | null;
  grade_level?: number | null;
  difficulty?: number | null;
  word_count?: number | null;
  status: string;
  pack_id?: string | null;
  pack_order?: number | null;
  freshness_until?: string | null;
  age_min_level?: string | null;
  content_warnings?: string[] | null;
  audio_zh_url?: string | null;
}

export interface RecommendationContext {
  child: ChildProfile;
  candidates: ArticleCandidate[];
  recentReadCategories: string[];
  recentAccuracy?: number;
  now?: Date;
}

export interface ScoredArticle {
  article: ArticleCandidate;
  score: number; // 0..100
  reasons: string[];
  excluded?:
    | "age_gate"
    | "wrong_language"
    | "expired"
    | "already_read_recently";
}

const RAZ_RE = /^L([1-9]|1[0-2])$/;

/**
 * Parse 'L4' → 4, 'L12' → 12. Returns null on null/undefined/invalid input.
 * Accepts L1..L12 only; 'L0', 'L13', 'X', '' all yield null.
 */
export function parseRazLevel(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = RAZ_RE.exec(s);
  if (!m) return null;
  return Number(m[1]);
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function childLevelFor(
  child: ChildProfile,
  language: "zh" | "en",
): { base: number | null; max: number | null } {
  if (language === "en") {
    return {
      base: parseRazLevel(child.reading_level_en),
      max: parseRazLevel(child.reading_level_en_max ?? null),
    };
  }
  return {
    base: parseRazLevel(child.reading_level_zh),
    max: parseRazLevel(child.reading_level_zh_max ?? null),
  };
}

function levelMatchScore(
  childLevel: number,
  childMax: number | null,
  articleLevel: number,
): { delta: number; reason: string; hardCapped: boolean } {
  const diff = articleLevel - childLevel;
  const abs = Math.abs(diff);
  let delta = 0;
  let reason = "";
  if (abs === 0) {
    delta = 30;
    reason = `level match L${articleLevel} = child L${childLevel} (+30)`;
  } else if (abs === 1) {
    delta = 20;
    reason = `level near L${articleLevel} vs child L${childLevel} (+20)`;
  } else if (abs === 2) {
    delta = 5;
    reason = `level ±2 L${articleLevel} vs child L${childLevel} (+5)`;
  } else {
    delta = -10;
    reason = `level far L${articleLevel} vs child L${childLevel} (-10)`;
  }

  let hardCapped = false;
  if (childMax !== null && articleLevel > childMax) {
    delta -= 30;
    reason += `; above child ceiling L${childMax} (-30 hard cap)`;
    hardCapped = true;
  }
  return { delta, reason, hardCapped };
}

function categoryPriorityScore(
  child: ChildProfile,
  categoryV2: string | null | undefined,
): { delta: number; reason: string } {
  if (!categoryV2 || !child.category_priorities) {
    return { delta: 0, reason: "" };
  }
  const cp = child.category_priorities;
  if (cp.高 && cp.高.includes(categoryV2)) {
    return { delta: 15, reason: `priority 高 (${categoryV2}) +15` };
  }
  if (cp.中 && cp.中.includes(categoryV2)) {
    return { delta: 5, reason: `priority 中 (${categoryV2}) +5` };
  }
  if (cp.低 && cp.低.includes(categoryV2)) {
    return { delta: -5, reason: `priority 低 (${categoryV2}) -5` };
  }
  return { delta: 0, reason: "" };
}

function interestSignalScore(
  child: ChildProfile,
  categoryV2: string | null | undefined,
): { delta: number; reason: string } {
  if (!categoryV2 || !child.interest_signal) {
    return { delta: 0, reason: "" };
  }
  const raw = child.interest_signal[categoryV2];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { delta: 0, reason: "" };
  }
  const delta = clamp(raw * 10, 0, 10);
  if (delta <= 0) return { delta: 0, reason: "" };
  return {
    delta,
    reason: `interest in ${categoryV2} (+${round1(delta)})`,
  };
}

function varietyPenalty(
  recent: string[],
  categoryV2: string | null | undefined,
): { delta: number; reason: string } {
  if (!categoryV2 || recent.length === 0) {
    return { delta: 0, reason: "" };
  }
  const count = recent.reduce((acc, c) => (c === categoryV2 ? acc + 1 : acc), 0);
  if (count <= 0) return { delta: 0, reason: "" };
  if (count === 1) {
    return {
      delta: -7,
      reason: `recent variety: ${categoryV2} seen 1x (-7)`,
    };
  }
  // 2 or more — capped at -15
  return {
    delta: -15,
    reason: `recent variety: ${categoryV2} seen ${count}x (-15 cap)`,
  };
}

function freshnessBonus(
  freshnessUntil: string | null | undefined,
  now: Date,
): { delta: number; reason: string; expired: boolean } {
  if (!freshnessUntil) return { delta: 0, reason: "", expired: false };
  const t = Date.parse(freshnessUntil);
  if (!Number.isFinite(t)) {
    // Malformed timestamp — treat as evergreen (no bonus, not excluded).
    return { delta: 0, reason: "", expired: false };
  }
  const ms = t - now.getTime();
  if (ms <= 0) {
    return { delta: 0, reason: "", expired: true };
  }
  const days = ms / 86_400_000;
  if (days >= 14) return { delta: 10, reason: "fresh ≥14d (+10)", expired: false };
  if (days >= 7) return { delta: 6, reason: "fresh 7-13d (+6)", expired: false };
  if (days >= 1) return { delta: 3, reason: "fresh 1-6d (+3)", expired: false };
  // <1 day remaining but still positive — count as 1-6d band lower edge.
  return { delta: 3, reason: "fresh <1d (+3)", expired: false };
}

function audioBonus(article: ArticleCandidate): {
  delta: number;
  reason: string;
} {
  if (article.language === "zh" && article.audio_zh_url) {
    return { delta: 3, reason: "zh audio available (+3)" };
  }
  return { delta: 0, reason: "" };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function scoreOne(
  article: ArticleCandidate,
  ctx: RecommendationContext,
  now: Date,
): ScoredArticle {
  const reasons: string[] = [];
  let score = 50;
  reasons.push("base 50");

  const { base: childLevel, max: childMax } = childLevelFor(
    ctx.child,
    article.language,
  );

  // Exclusion A: wrong_language — child has no level for the article's
  // language at all (empty string + null max). The frozen API expects
  // candidates to be a same-language pool, but we guard mixed pools here.
  if (childLevel === null && childMax === null) {
    return {
      article,
      score: 0,
      reasons: ["excluded: wrong_language (child has no level for this language)"],
      excluded: "wrong_language",
    };
  }

  // Exclusion B: age_gate — article.age_min_level above child level for the
  // article's language.
  const ageMin = parseRazLevel(article.age_min_level ?? null);
  if (ageMin !== null) {
    const cmp = childLevel ?? 0;
    if (cmp < ageMin) {
      return {
        article,
        score: 0,
        reasons: [`excluded: age_gate (article L${ageMin} > child L${cmp})`],
        excluded: "age_gate",
      };
    }
  }

  // Exclusion C: expired — checked via freshnessBonus output below; bail
  // before applying other adjustments because excluded score is forced to 0.
  const freshness = freshnessBonus(article.freshness_until, now);
  if (freshness.expired) {
    return {
      article,
      score: 0,
      reasons: ["excluded: expired (freshness_until in the past)"],
      excluded: "expired",
    };
  }

  // 2. Level match
  const articleLevel = parseRazLevel(article.raz_level ?? null);
  if (articleLevel !== null && childLevel !== null) {
    const lm = levelMatchScore(childLevel, childMax, articleLevel);
    score += lm.delta;
    reasons.push(lm.reason);
  } else {
    reasons.push("level match skipped (missing raz_level)");
  }

  // 3. Category priority
  const cat = categoryPriorityScore(ctx.child, article.category_v2 ?? null);
  if (cat.delta !== 0) {
    score += cat.delta;
    reasons.push(cat.reason);
  }

  // 4. Interest signal
  const interest = interestSignalScore(ctx.child, article.category_v2 ?? null);
  if (interest.delta !== 0) {
    score += interest.delta;
    reasons.push(interest.reason);
  }

  // 5. Variety penalty
  const variety = varietyPenalty(
    ctx.recentReadCategories,
    article.category_v2 ?? null,
  );
  if (variety.delta !== 0) {
    score += variety.delta;
    reasons.push(variety.reason);
  }

  // 6. Freshness bonus
  if (freshness.delta !== 0) {
    score += freshness.delta;
    reasons.push(freshness.reason);
  }

  // 7. Pack continuity — v1 TODO. We do not have recent pack_ids in ctx.
  // Skipped intentionally; revisit in W3 when ctx is extended.

  // 8. Audio readiness
  const audio = audioBonus(article);
  if (audio.delta !== 0) {
    score += audio.delta;
    reasons.push(audio.reason);
  }

  const finalScore = clamp(score, 0, 100);
  return {
    article,
    score: finalScore,
    reasons,
  };
}

function compareScored(a: ScoredArticle, b: ScoredArticle): number {
  // Excluded items always sink to the bottom regardless of score.
  const aExcluded = a.excluded ? 1 : 0;
  const bExcluded = b.excluded ? 1 : 0;
  if (aExcluded !== bExcluded) return aExcluded - bExcluded;

  if (b.score !== a.score) return b.score - a.score;

  const ad = a.article.difficulty ?? -Infinity;
  const bd = b.article.difficulty ?? -Infinity;
  if (bd !== ad) return bd - ad;

  // topic_key alphabetical ascending
  if (a.article.topic_key < b.article.topic_key) return -1;
  if (a.article.topic_key > b.article.topic_key) return 1;
  return 0;
}

/**
 * Score and rank candidate articles for a child. Pure function.
 *
 * Excluded articles are still returned with `excluded` set and score=0,
 * pushed to the bottom of the list. Use `result.filter(s => !s.excluded)`
 * to get the actionable ranked list.
 */
export function scoreRecommendations(
  ctx: RecommendationContext,
): ScoredArticle[] {
  const now = ctx.now ?? new Date();
  const scored = ctx.candidates.map((c) => scoreOne(c, ctx, now));
  scored.sort(compareScored);
  return scored;
}

/**
 * Convenience: top-K articles, excluded ones already removed.
 */
export function topRecommendations(
  ctx: RecommendationContext,
  k: number,
): ScoredArticle[] {
  if (k <= 0) return [];
  return scoreRecommendations(ctx)
    .filter((s) => !s.excluded)
    .slice(0, k);
}
