import { describe, it, expect } from "vitest";
import {
  parseRazLevel,
  scoreRecommendations,
  topRecommendations,
  type ArticleCandidate,
  type ChildProfile,
  type RecommendationContext,
} from "@/lib/reading/recommendation";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeChild(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id: "child-1",
    reading_level_en: "L4",
    reading_level_zh: "L3",
    ...overrides,
  };
}

function makeArticle(overrides: Partial<ArticleCandidate> = {}): ArticleCandidate {
  return {
    id: "art-" + (overrides.topic_key ?? "x"),
    topic_key: "x",
    title: "Untitled",
    language: "en",
    category: "science",
    category_v2: "science",
    raz_level: "L4",
    grade_level: 4,
    difficulty: 3,
    word_count: 200,
    status: "published",
    pack_id: null,
    pack_order: null,
    freshness_until: null,
    age_min_level: null,
    content_warnings: null,
    audio_zh_url: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<RecommendationContext> = {}): RecommendationContext {
  return {
    child: makeChild(),
    candidates: [],
    recentReadCategories: [],
    now: new Date("2026-05-10T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseRazLevel
// ---------------------------------------------------------------------------

describe("parseRazLevel", () => {
  it("parses valid L1..L12", () => {
    expect(parseRazLevel("L1")).toBe(1);
    expect(parseRazLevel("L4")).toBe(4);
    expect(parseRazLevel("L12")).toBe(12);
  });

  it("rejects out-of-range and malformed input", () => {
    expect(parseRazLevel("L0")).toBeNull();
    expect(parseRazLevel("L13")).toBeNull();
    expect(parseRazLevel("X")).toBeNull();
    expect(parseRazLevel("")).toBeNull();
    expect(parseRazLevel(null)).toBeNull();
    expect(parseRazLevel(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scoreRecommendations basics
// ---------------------------------------------------------------------------

describe("scoreRecommendations - empty", () => {
  it("returns [] for empty candidates", () => {
    const result = scoreRecommendations(makeCtx());
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Level match
// ---------------------------------------------------------------------------

describe("scoreRecommendations - level match", () => {
  it("exact match adds +30 (base 50 -> 80)", () => {
    const result = scoreRecommendations(
      makeCtx({
        child: makeChild({ reading_level_en: "L4" }),
        candidates: [makeArticle({ topic_key: "exact", raz_level: "L4" })],
      }),
    );
    expect(result[0].score).toBe(80);
  });

  it("±1 level adds +20 (base 50 -> 70)", () => {
    const result = scoreRecommendations(
      makeCtx({
        child: makeChild({ reading_level_en: "L4" }),
        candidates: [makeArticle({ topic_key: "near", raz_level: "L5" })],
      }),
    );
    expect(result[0].score).toBe(70);
  });

  it("±2 level adds +5 (base 50 -> 55)", () => {
    const result = scoreRecommendations(
      makeCtx({
        child: makeChild({ reading_level_en: "L4" }),
        candidates: [makeArticle({ topic_key: "two", raz_level: "L6" })],
      }),
    );
    expect(result[0].score).toBe(55);
  });

  it("beyond ±2 levels deducts -10 (base 50 -> 40)", () => {
    const result = scoreRecommendations(
      makeCtx({
        child: makeChild({ reading_level_en: "L4" }),
        candidates: [makeArticle({ topic_key: "far", raz_level: "L8" })],
      }),
    );
    expect(result[0].score).toBe(40);
  });

  it("hard caps -30 when article level > reading_level_en_max", () => {
    // child L4, max L5; article L7 -> level diff +3 (=-10), then over max (-30)
    // base 50 - 10 - 30 = 10
    const result = scoreRecommendations(
      makeCtx({
        child: makeChild({ reading_level_en: "L4", reading_level_en_max: "L5" }),
        candidates: [makeArticle({ topic_key: "ceiling", raz_level: "L7" })],
      }),
    );
    expect(result[0].score).toBe(10);
    expect(result[0].excluded).toBeUndefined();
    expect(result[0].reasons.join(" ")).toMatch(/ceiling|hard cap/);
  });
});

// ---------------------------------------------------------------------------
// Exclusion: age_gate
// ---------------------------------------------------------------------------

describe("scoreRecommendations - age_gate", () => {
  it("excludes article whose age_min_level exceeds child level", () => {
    const result = scoreRecommendations(
      makeCtx({
        child: makeChild({ reading_level_en: "L3" }),
        candidates: [
          makeArticle({
            topic_key: "locked",
            raz_level: "L5",
            age_min_level: "L5",
          }),
        ],
      }),
    );
    expect(result[0].excluded).toBe("age_gate");
    expect(result[0].score).toBe(0);
  });

  it("does not exclude when child meets age_min_level", () => {
    const result = scoreRecommendations(
      makeCtx({
        child: makeChild({ reading_level_en: "L5" }),
        candidates: [
          makeArticle({
            topic_key: "ok",
            raz_level: "L5",
            age_min_level: "L5",
          }),
        ],
      }),
    );
    expect(result[0].excluded).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Variety penalty
// ---------------------------------------------------------------------------

describe("scoreRecommendations - variety penalty", () => {
  it("applies -7 for one prior occurrence", () => {
    const result = scoreRecommendations(
      makeCtx({
        candidates: [
          makeArticle({ topic_key: "v1", raz_level: "L4", category_v2: "science" }),
        ],
        recentReadCategories: ["science", "history"],
      }),
    );
    // base 50 + level exact 30 - 7 variety = 73
    expect(result[0].score).toBe(73);
  });

  it("caps -15 when category appears twice in recent", () => {
    const result = scoreRecommendations(
      makeCtx({
        candidates: [
          makeArticle({ topic_key: "v2", raz_level: "L4", category_v2: "science" }),
        ],
        recentReadCategories: ["science", "science", "nature"],
      }),
    );
    // base 50 + 30 - 15 = 65
    expect(result[0].score).toBe(65);
  });

  it("caps -15 even when category appears 3+ times", () => {
    const result = scoreRecommendations(
      makeCtx({
        candidates: [
          makeArticle({ topic_key: "v3", raz_level: "L4", category_v2: "science" }),
        ],
        recentReadCategories: ["science", "science", "science", "science"],
      }),
    );
    expect(result[0].score).toBe(65);
  });
});

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

describe("scoreRecommendations - freshness", () => {
  it("adds +3 for an article fresh ~3 days ahead", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const fresh = new Date("2026-05-13T00:00:00Z").toISOString(); // 3 days
    const result = scoreRecommendations(
      makeCtx({
        now,
        candidates: [
          makeArticle({
            topic_key: "fresh3",
            raz_level: "L4",
            freshness_until: fresh,
          }),
        ],
      }),
    );
    // base 50 + 30 + 3 = 83
    expect(result[0].score).toBe(83);
  });

  it("adds +10 for an article fresh ≥14 days", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const fresh = new Date("2026-06-01T00:00:00Z").toISOString(); // ~22 days
    const result = scoreRecommendations(
      makeCtx({
        now,
        candidates: [
          makeArticle({
            topic_key: "fresh14",
            raz_level: "L4",
            freshness_until: fresh,
          }),
        ],
      }),
    );
    expect(result[0].score).toBe(90); // 50 + 30 + 10
  });

  it("excludes when freshness_until is in the past", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const old = new Date("2026-05-01T00:00:00Z").toISOString();
    const result = scoreRecommendations(
      makeCtx({
        now,
        candidates: [
          makeArticle({
            topic_key: "old",
            raz_level: "L4",
            freshness_until: old,
          }),
        ],
      }),
    );
    expect(result[0].excluded).toBe("expired");
    expect(result[0].score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Audio bonus
// ---------------------------------------------------------------------------

describe("scoreRecommendations - audio bonus", () => {
  it("adds +3 to a zh article with audio_zh_url over an identical no-audio one", () => {
    const child = makeChild({ reading_level_zh: "L3" });
    const ctx = makeCtx({
      child,
      candidates: [
        makeArticle({
          id: "zh-audio",
          topic_key: "zh-audio",
          language: "zh",
          raz_level: "L3",
          audio_zh_url: "https://example.test/a.mp3",
        }),
        makeArticle({
          id: "zh-noaudio",
          topic_key: "zh-noaudio",
          language: "zh",
          raz_level: "L3",
          audio_zh_url: null,
        }),
      ],
    });
    const result = scoreRecommendations(ctx);
    const audio = result.find((r) => r.article.id === "zh-audio")!;
    const noAudio = result.find((r) => r.article.id === "zh-noaudio")!;
    expect(audio.score - noAudio.score).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Category priority + interest signal
// ---------------------------------------------------------------------------

describe("scoreRecommendations - category priority and interest", () => {
  it("applies 高 +15 / 中 +5 / 低 -5", () => {
    const child = makeChild({
      category_priorities: { 高: ["science"], 中: ["history"], 低: ["sports"] },
    });
    const ctx = makeCtx({
      child,
      candidates: [
        makeArticle({ topic_key: "hi", raz_level: "L4", category_v2: "science" }),
        makeArticle({ topic_key: "mid", raz_level: "L4", category_v2: "history" }),
        makeArticle({ topic_key: "lo", raz_level: "L4", category_v2: "sports" }),
      ],
    });
    const result = scoreRecommendations(ctx);
    const hi = result.find((r) => r.article.topic_key === "hi")!;
    const mid = result.find((r) => r.article.topic_key === "mid")!;
    const lo = result.find((r) => r.article.topic_key === "lo")!;
    expect(hi.score).toBe(95); // 50 + 30 + 15
    expect(mid.score).toBe(85); // 50 + 30 + 5
    expect(lo.score).toBe(75); // 50 + 30 - 5
  });

  it("adds clamped interest signal (raw 0.7 -> +7)", () => {
    const child = makeChild({ interest_signal: { science: 0.7, sports: -1 } });
    const ctx = makeCtx({
      child,
      candidates: [
        makeArticle({ topic_key: "sci", raz_level: "L4", category_v2: "science" }),
      ],
    });
    const result = scoreRecommendations(ctx);
    expect(result[0].score).toBe(87); // 50 + 30 + 7
  });
});

// ---------------------------------------------------------------------------
// topRecommendations
// ---------------------------------------------------------------------------

describe("topRecommendations", () => {
  it("returns at most K, all non-excluded, sorted desc by score", () => {
    const child = makeChild({ reading_level_en: "L4" });
    const ctx = makeCtx({
      child,
      candidates: [
        makeArticle({ topic_key: "a", raz_level: "L4" }), // 80
        makeArticle({ topic_key: "b", raz_level: "L5" }), // 70
        makeArticle({ topic_key: "c", raz_level: "L6" }), // 55
        makeArticle({ topic_key: "d", raz_level: "L8" }), // 40
        makeArticle({
          topic_key: "e",
          raz_level: "L5",
          age_min_level: "L99", // invalid -> null -> not gating
        }),
        makeArticle({
          topic_key: "z-locked",
          raz_level: "L5",
          age_min_level: "L10",
        }),
      ],
    });
    const top = topRecommendations(ctx, 3);
    expect(top.length).toBe(3);
    expect(top.every((s) => !s.excluded)).toBe(true);
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
    expect(top[1].score).toBeGreaterThanOrEqual(top[2].score);
  });

  it("returns [] when k <= 0", () => {
    expect(topRecommendations(makeCtx(), 0)).toEqual([]);
    expect(topRecommendations(makeCtx(), -3)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tie-break + clamp
// ---------------------------------------------------------------------------

describe("scoreRecommendations - ties and clamping", () => {
  it("breaks ties by descending difficulty then topic_key asc", () => {
    const ctx = makeCtx({
      candidates: [
        makeArticle({ topic_key: "b-easy", raz_level: "L4", difficulty: 2 }),
        makeArticle({ topic_key: "a-hard", raz_level: "L4", difficulty: 4 }),
        makeArticle({ topic_key: "c-hard", raz_level: "L4", difficulty: 4 }),
      ],
    });
    const result = scoreRecommendations(ctx);
    // All score 80; order: harder difficulty first, then topic_key asc
    expect(result.map((r) => r.article.topic_key)).toEqual([
      "a-hard",
      "c-hard",
      "b-easy",
    ]);
  });

  it("clamps final score to [0, 100]", () => {
    // Stack many positives and check upper clamp.
    const child = makeChild({
      reading_level_en: "L4",
      category_priorities: { 高: ["science"] },
      interest_signal: { science: 1 },
    });
    const ctx = makeCtx({
      now: new Date("2026-05-10T00:00:00Z"),
      child,
      candidates: [
        makeArticle({
          topic_key: "max",
          raz_level: "L4",
          category_v2: "science",
          freshness_until: new Date("2026-06-30T00:00:00Z").toISOString(),
        }),
      ],
    });
    // 50 + 30 (level) + 15 (高) + 10 (interest) + 10 (fresh) = 115 -> clamp 100
    expect(scoreRecommendations(ctx)[0].score).toBe(100);
  });
});
