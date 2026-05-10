#!/usr/bin/env tsx
/**
 * W0a Topic Matrix v2 Seed Script
 *
 * Seeds the topic_packs catalog and reading_topics extension fields
 * (introduced by migrations 038 + 039) from the §2 topic matrix in
 * .planning/topic-matrix-v2.md, honoring the §0.1 resolutions:
 *   - Q1: +2 中国史 topics (anti-japanese-war, new-china-founding) → 153 total.
 *   - Q2: G3 block list (age_min_level='L5') for opium-war, wwii-overview,
 *         black-death, mental-health, anti-japanese-war.
 *   - Q6: every previously zh+en topic resolved to a single primary language.
 *
 * Usage:
 *   npx tsx scripts/seed-topic-matrix-v2.ts --dry-run   (default; no DB write)
 *   npx tsx scripts/seed-topic-matrix-v2.ts --execute   (upsert to Supabase)
 *
 * Requires (only for --execute):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * No new npm dependencies; uses dotenv (already a dependency) for .env.local.
 *
 * --- §0.1 Q6 single-language resolution table (verbatim, authoritative) ---
 * | topic_key                          | Final Language |
 * |------------------------------------|----------------|
 * | lit-little-prince (renamed)        | en             |
 * | culture-spring-festival            | zh             |
 * | culture-mid-autumn                 | zh             |
 * | culture-chinese-tea-ceremony       | zh             |
 * | culture-beijing-opera              | zh             |
 * | art-chinese-ink-painting           | zh             |
 * | art-dunhuang-murals                | zh             |
 * | bio-tu-youyou                      | zh             |
 * | bio-qian-xuesen                    | zh             |
 * | space-china-space-program          | zh             |
 * | sports-china-olympics-2008-2022    | zh             |
 * | sports-tai-chi-martial-arts        | zh             |
 * | env-china-environmental-action     | zh             |
 * | nature-china-yellow-mountains      | zh             |
 * | nature-china-jiuzhaigou            | zh             |
 * --------------------------------------------------------------------------
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface TopicPackSeed {
  pack_id: string;
  pack_name_zh: string;
  pack_name_en: string;
  category: string; // one of the 18 v2 categories (zh label)
  language: "zh" | "en"; // never 'zh+en' — see Q6
  recommended_levels: string[];
  description?: string;
}

interface TopicSeed {
  topic_key: string;
  language: "zh" | "en";
  category: string; // legacy column (kept for compat)
  category_v2: string; // new column (one of 18 v2 categories)
  pack_id: string | null;
  pack_order: number | null;
  recommended_levels: string[]; // e.g., ['L4','L5']
  target_grades: number[]; // computed from recommended_levels (L3→3, …) dedup
  age_min_level: string | null; // e.g., 'L5' for blocked topics
  content_warnings: string[]; // e.g., ['war','death']
  source_text?: string | null;
  source_url?: string | null;
  status: "active";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Expand a level range like ['L4','L5','L6'] from a "Lx-Ly" pair. */
function levelRange(min: number, max: number): string[] {
  const out: string[] = [];
  for (let i = min; i <= max; i++) out.push(`L${i}`);
  return out;
}

/** Convert recommended_levels (['L3','L5']) → unique sorted target_grades. */
function levelsToGrades(levels: string[]): number[] {
  const grades = new Set<number>();
  for (const l of levels) {
    const m = /^L(\d+)$/.exec(l);
    if (m) grades.add(parseInt(m[1], 10));
  }
  return Array.from(grades).sort((a, b) => a - b);
}

/** Build a topic with target_grades auto-computed and sensible defaults. */
function topic(
  base: Omit<TopicSeed, "target_grades" | "status"> & { status?: "active" }
): TopicSeed {
  return {
    ...base,
    target_grades: levelsToGrades(base.recommended_levels),
    age_min_level: base.age_min_level ?? null,
    content_warnings: base.content_warnings ?? [],
    source_text: base.source_text ?? null,
    source_url: base.source_url ?? null,
    status: "active",
  };
}

// Map v2 zh category → legacy `category` enum string used by existing
// reading_topics rows. We keep the v2 zh label in `category` so the legacy
// column stays human-readable; downstream code reads `category_v2` going
// forward (per migration 038 §5b note: "kept legacy `category` for compat").
const CATEGORY_LEGACY: Record<string, string> = {
  中国史: "history",
  美国史: "history",
  世界史: "history",
  文学: "culture",
  诗歌: "culture",
  文化: "culture",
  艺术: "culture",
  经济与生活: "current",
  故事: "stories",
  人物: "biography",
  科学: "science",
  "数码与AI": "science",
  太空与天文: "science",
  医学健康: "science",
  时事: "current",
  体育: "current",
  环保: "current",
  自然生态: "nature",
};

const CATEGORIES_V2 = [
  "中国史",
  "美国史",
  "世界史",
  "文学",
  "诗歌",
  "文化",
  "艺术",
  "经济与生活",
  "故事",
  "人物",
  "科学",
  "数码与AI",
  "太空与天文",
  "医学健康",
  "时事",
  "体育",
  "环保",
  "自然生态",
] as const;

// ---------------------------------------------------------------------------
// TOPIC_PACKS
// ---------------------------------------------------------------------------
// Packs come exclusively from §2 Cat 1-3 (history triplet); other categories
// in §2 do not assign topics to packs. This yields 18 packs. Task spec says
// "~30 packs"; planning doc only enumerates 18 — see key_findings in report.

const TOPIC_PACKS: TopicPackSeed[] = [
  // Cat 1 — 中国史 (7 packs)
  {
    pack_id: "china-foundations",
    pack_name_zh: "华夏起源",
    pack_name_en: "Foundations of Chinese Civilization",
    category: "中国史",
    language: "zh",
    recommended_levels: levelRange(3, 5),
    description: "上古传说与神话奠基",
  },
  {
    pack_id: "china-empire",
    pack_name_zh: "秦汉帝国",
    pack_name_en: "Qin & Han Empires",
    category: "中国史",
    language: "zh",
    recommended_levels: levelRange(4, 7),
    description: "中央集权与丝绸之路",
  },
  {
    pack_id: "china-three-kingdoms",
    pack_name_zh: "三国故事",
    pack_name_en: "The Three Kingdoms",
    category: "中国史",
    language: "zh",
    recommended_levels: levelRange(4, 7),
    description: "东汉末年的英雄叙事",
  },
  {
    pack_id: "china-tang",
    pack_name_zh: "唐风万象",
    pack_name_en: "The Tang Dynasty",
    category: "中国史",
    language: "zh",
    recommended_levels: levelRange(4, 7),
    description: "盛唐文化与对外交流",
  },
  {
    pack_id: "china-ming",
    pack_name_zh: "明代中国",
    pack_name_en: "The Ming Dynasty",
    category: "中国史",
    language: "zh",
    recommended_levels: levelRange(4, 8),
    description: "海上丝绸之路与紫禁城",
  },
  {
    pack_id: "china-modern",
    pack_name_zh: "近代中国",
    pack_name_en: "Modern China",
    category: "中国史",
    language: "zh",
    recommended_levels: levelRange(6, 8),
    description: "鸦片战争至辛亥革命，含抗日战争",
  },
  {
    pack_id: "china-contemporary",
    pack_name_zh: "当代中国",
    pack_name_en: "Contemporary China",
    category: "中国史",
    language: "zh",
    recommended_levels: levelRange(5, 8),
    description: "新中国成立与改革开放",
  },

  // Cat 2 — 美国史 (6 packs)
  {
    pack_id: "us-colonial",
    pack_name_zh: "殖民地时期",
    pack_name_en: "Colonial America",
    category: "美国史",
    language: "en",
    recommended_levels: levelRange(3, 6),
    description: "Pilgrims and the Thirteen Colonies",
  },
  {
    pack_id: "us-revolution",
    pack_name_zh: "美国独立",
    pack_name_en: "The American Revolution",
    category: "美国史",
    language: "en",
    recommended_levels: levelRange(4, 7),
    description: "From Boston Tea Party to Independence",
  },
  {
    pack_id: "us-civil-war",
    pack_name_zh: "南北战争",
    pack_name_en: "The American Civil War",
    category: "美国史",
    language: "en",
    recommended_levels: levelRange(5, 7),
    description: "Lincoln and emancipation",
  },
  {
    pack_id: "us-westward",
    pack_name_zh: "西进运动",
    pack_name_en: "Westward Expansion",
    category: "美国史",
    language: "en",
    recommended_levels: levelRange(4, 6),
    description: "The transcontinental era",
  },
  {
    pack_id: "us-20c",
    pack_name_zh: "二十世纪美国",
    pack_name_en: "Twentieth-Century America",
    category: "美国史",
    language: "en",
    recommended_levels: levelRange(4, 8),
    description: "From the New Deal to civil rights and the moon",
  },
  {
    pack_id: "us-tech",
    pack_name_zh: "科技与互联网",
    pack_name_en: "American Tech & The Internet Age",
    category: "美国史",
    language: "en",
    recommended_levels: levelRange(6, 8),
    description: "ARPANET to the modern web",
  },

  // Cat 3 — 世界史 (5 packs)
  {
    pack_id: "ancient-civilizations",
    pack_name_zh: "古代文明",
    pack_name_en: "Ancient Civilizations",
    category: "世界史",
    language: "en",
    recommended_levels: levelRange(3, 7),
    description: "Egypt and Mesopotamia",
  },
  {
    pack_id: "classical-antiquity",
    pack_name_zh: "古典时代",
    pack_name_en: "Classical Antiquity",
    category: "世界史",
    language: "en",
    recommended_levels: levelRange(4, 7),
    description: "Greek democracy and the Roman Empire",
  },
  {
    pack_id: "medieval",
    pack_name_zh: "中世纪",
    pack_name_en: "The Medieval World",
    category: "世界史",
    language: "en",
    recommended_levels: levelRange(4, 8),
    description: "Vikings and the Black Death",
  },
  {
    pack_id: "early-modern",
    pack_name_zh: "近代早期",
    pack_name_en: "Early Modern Era",
    category: "世界史",
    language: "en",
    recommended_levels: levelRange(5, 8),
    description: "Renaissance and Age of Exploration",
  },
  {
    pack_id: "modern",
    pack_name_zh: "近现代世界",
    pack_name_en: "The Modern World",
    category: "世界史",
    language: "en",
    recommended_levels: levelRange(6, 8),
    description: "Industrial Revolution and World War II",
  },
];

// ---------------------------------------------------------------------------
// TOPICS — 153 entries, in §2 order (with §0.1 Q1 additions appended to Cat 1)
// ---------------------------------------------------------------------------

const TOPICS: TopicSeed[] = [
  // ---------- Cat 1 — 中国史 (12) ----------
  topic({
    topic_key: "zh-history-yu-the-great",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-foundations",
    pack_order: 1,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "zh-history-qin-unification",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-empire",
    pack_order: 1,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "zh-history-silk-road-zhang-qian",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-empire",
    pack_order: 2,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "zh-history-three-visits-thatched-cottage",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-three-kingdoms",
    pack_order: 1,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "zh-history-xuanzang-pilgrimage",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-tang",
    pack_order: 1,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "zh-history-zheng-he-voyages",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-ming",
    pack_order: 1,
    recommended_levels: levelRange(5, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "zh-history-forbidden-city-construction",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-ming",
    pack_order: 2,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "zh-history-opium-war",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-modern",
    pack_order: 1,
    recommended_levels: levelRange(6, 8),
    age_min_level: "L5", // §0.1 Q2 G3 block
    content_warnings: ["war", "violence"],
  }),
  topic({
    topic_key: "zh-history-1911-revolution",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-modern",
    pack_order: 2,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: ["politics"],
  }),
  topic({
    topic_key: "zh-history-reform-and-opening",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-contemporary",
    pack_order: 1,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  // §0.1 Q1 additions
  topic({
    topic_key: "zh-history-anti-japanese-war",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-modern",
    pack_order: 3,
    recommended_levels: levelRange(6, 8),
    age_min_level: "L5", // §0.1 Q2 block
    content_warnings: ["war"],
  }),
  topic({
    topic_key: "zh-history-new-china-founding",
    language: "zh",
    category: CATEGORY_LEGACY["中国史"],
    category_v2: "中国史",
    pack_id: "china-contemporary",
    pack_order: 0, // §0.1 Q1: pack_order=0 = before reform-and-opening
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: ["politics"],
  }),

  // ---------- Cat 2 — 美国史 (10) ----------
  topic({
    topic_key: "us-history-mayflower",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-colonial",
    pack_order: 1,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "us-history-thirteen-colonies",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-colonial",
    pack_order: 2,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "us-history-boston-tea-party",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-revolution",
    pack_order: 1,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "us-history-declaration-of-independence",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-revolution",
    pack_order: 2,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "us-history-lincoln-emancipation",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-civil-war",
    pack_order: 1,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: ["war"],
  }),
  topic({
    topic_key: "us-history-transcontinental-railroad",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-westward",
    pack_order: 1,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "us-history-fdr-new-deal",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-20c",
    pack_order: 1,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "us-history-mlk-civil-rights",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-20c",
    pack_order: 2,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "us-history-apollo-moon-landing",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-20c",
    pack_order: 3,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "us-history-internet-origins-arpanet",
    language: "en",
    category: CATEGORY_LEGACY["美国史"],
    category_v2: "美国史",
    pack_id: "us-tech",
    pack_order: 1,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 3 — 世界史 (10) ----------
  topic({
    topic_key: "world-history-egypt-pyramids",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "ancient-civilizations",
    pack_order: 1,
    recommended_levels: levelRange(3, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "world-history-mesopotamia-cuneiform",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "ancient-civilizations",
    pack_order: 2,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "world-history-greek-democracy",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "classical-antiquity",
    pack_order: 1,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "world-history-roman-empire",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "classical-antiquity",
    pack_order: 2,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "world-history-viking-age",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "medieval",
    pack_order: 1,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "world-history-black-death",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "medieval",
    pack_order: 2,
    recommended_levels: levelRange(6, 8),
    age_min_level: "L5", // §0.1 Q2 G3 block
    content_warnings: ["death", "disease"],
  }),
  topic({
    topic_key: "world-history-renaissance",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "early-modern",
    pack_order: 1,
    recommended_levels: levelRange(5, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "world-history-age-of-exploration",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "early-modern",
    pack_order: 2,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "world-history-industrial-revolution",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "modern",
    pack_order: 1,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "world-history-wwii-overview",
    language: "en",
    category: CATEGORY_LEGACY["世界史"],
    category_v2: "世界史",
    pack_id: "modern",
    pack_order: 2,
    recommended_levels: levelRange(6, 8),
    age_min_level: "L5", // §0.1 Q2 G3 block
    content_warnings: ["war", "death"],
  }),

  // ---------- Cat 4 — 文学 (8) ----------
  topic({
    topic_key: "lit-charlottes-web",
    language: "en",
    category: CATEGORY_LEGACY["文学"],
    category_v2: "文学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "lit-wonder-by-rj-palacio",
    language: "en",
    category: CATEGORY_LEGACY["文学"],
    category_v2: "文学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "lit-harry-potter-themes",
    language: "en",
    category: CATEGORY_LEGACY["文学"],
    category_v2: "文学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "lit-roald-dahl-style",
    language: "en",
    category: CATEGORY_LEGACY["文学"],
    category_v2: "文学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "lit-xiyou-monkey-king",
    language: "zh",
    category: CATEGORY_LEGACY["文学"],
    category_v2: "文学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "lit-three-kingdoms-zhuge",
    language: "zh",
    category: CATEGORY_LEGACY["文学"],
    category_v2: "文学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "lit-luxun-hometown",
    language: "zh",
    category: CATEGORY_LEGACY["文学"],
    category_v2: "文学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  // §0.1 Q6: lit-little-prince-bilingual → renamed to lit-little-prince, language='en'
  topic({
    topic_key: "lit-little-prince",
    language: "en",
    category: CATEGORY_LEGACY["文学"],
    category_v2: "文学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 5 — 诗歌 (8) ----------
  topic({
    topic_key: "poetry-li-bai-jingyesi",
    language: "zh",
    category: CATEGORY_LEGACY["诗歌"],
    category_v2: "诗歌",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "poetry-meng-haoran-chunxiao",
    language: "zh",
    category: CATEGORY_LEGACY["诗歌"],
    category_v2: "诗歌",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "poetry-wang-zhihuan-denguanqulou",
    language: "zh",
    category: CATEGORY_LEGACY["诗歌"],
    category_v2: "诗歌",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "poetry-su-shi-shuidiao",
    language: "zh",
    category: CATEGORY_LEGACY["诗歌"],
    category_v2: "诗歌",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "poetry-shijing-guanju",
    language: "zh",
    category: CATEGORY_LEGACY["诗歌"],
    category_v2: "诗歌",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "poetry-robert-frost-road-not-taken",
    language: "en",
    category: CATEGORY_LEGACY["诗歌"],
    category_v2: "诗歌",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "poetry-shel-silverstein",
    language: "en",
    category: CATEGORY_LEGACY["诗歌"],
    category_v2: "诗歌",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "poetry-emily-dickinson-hope",
    language: "en",
    category: CATEGORY_LEGACY["诗歌"],
    category_v2: "诗歌",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 6 — 文化 (8) ----------
  topic({
    topic_key: "culture-spring-festival",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["文化"],
    category_v2: "文化",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
    source_text: null,
  }),
  topic({
    topic_key: "culture-mid-autumn",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["文化"],
    category_v2: "文化",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
    source_text: null,
  }),
  topic({
    topic_key: "culture-chinese-tea-ceremony",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["文化"],
    category_v2: "文化",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
    source_text: null,
  }),
  topic({
    topic_key: "culture-beijing-opera",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["文化"],
    category_v2: "文化",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
    source_text: null,
  }),
  topic({
    topic_key: "culture-japanese-tea-ceremony",
    language: "en",
    category: CATEGORY_LEGACY["文化"],
    category_v2: "文化",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "culture-diwali-festival",
    language: "en",
    category: CATEGORY_LEGACY["文化"],
    category_v2: "文化",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "culture-thanksgiving",
    language: "en",
    category: CATEGORY_LEGACY["文化"],
    category_v2: "文化",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "culture-mexican-day-of-dead",
    language: "en",
    category: CATEGORY_LEGACY["文化"],
    category_v2: "文化",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 7 — 艺术 (8) ----------
  topic({
    topic_key: "art-chinese-ink-painting",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["艺术"],
    category_v2: "艺术",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "art-dunhuang-murals",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["艺术"],
    category_v2: "艺术",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "art-monet-impressionism",
    language: "en",
    category: CATEGORY_LEGACY["艺术"],
    category_v2: "艺术",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "art-van-gogh-starry-night",
    language: "en",
    category: CATEGORY_LEGACY["艺术"],
    category_v2: "艺术",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "art-michelangelo-sistine",
    language: "en",
    category: CATEGORY_LEGACY["艺术"],
    category_v2: "艺术",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "art-pixar-animation-craft",
    language: "en",
    category: CATEGORY_LEGACY["艺术"],
    category_v2: "艺术",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "art-graffiti-banksy",
    language: "en",
    category: CATEGORY_LEGACY["艺术"],
    category_v2: "艺术",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "art-music-beethoven-symphony",
    language: "en",
    category: CATEGORY_LEGACY["艺术"],
    category_v2: "艺术",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 8 — 经济与生活 (8) ----------
  topic({
    topic_key: "econ-money-history",
    language: "en",
    category: CATEGORY_LEGACY["经济与生活"],
    category_v2: "经济与生活",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "econ-savings-and-compound-interest",
    language: "en",
    category: CATEGORY_LEGACY["经济与生活"],
    category_v2: "经济与生活",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "econ-stock-market-basics",
    language: "en",
    category: CATEGORY_LEGACY["经济与生活"],
    category_v2: "经济与生活",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "econ-inflation-explained",
    language: "en",
    category: CATEGORY_LEGACY["经济与生活"],
    category_v2: "经济与生活",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "econ-bitcoin-cryptocurrency",
    language: "en",
    category: CATEGORY_LEGACY["经济与生活"],
    category_v2: "经济与生活",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "econ-global-supply-chains",
    language: "en",
    category: CATEGORY_LEGACY["经济与生活"],
    category_v2: "经济与生活",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "econ-shipping-containers",
    language: "en",
    category: CATEGORY_LEGACY["经济与生活"],
    category_v2: "经济与生活",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "econ-fair-trade",
    language: "en",
    category: CATEGORY_LEGACY["经济与生活"],
    category_v2: "经济与生活",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 9 — 故事 (8) ----------
  topic({
    topic_key: "story-shouzhudaitu",
    language: "zh",
    category: CATEGORY_LEGACY["故事"],
    category_v2: "故事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "story-yangbulao",
    language: "zh",
    category: CATEGORY_LEGACY["故事"],
    category_v2: "故事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "story-changedrun-to-moon",
    language: "zh",
    category: CATEGORY_LEGACY["故事"],
    category_v2: "故事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "story-niulang-zhinv",
    language: "zh",
    category: CATEGORY_LEGACY["故事"],
    category_v2: "故事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "story-aesop-tortoise-hare",
    language: "en",
    category: CATEGORY_LEGACY["故事"],
    category_v2: "故事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "story-andersen-emperor-clothes",
    language: "en",
    category: CATEGORY_LEGACY["故事"],
    category_v2: "故事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "story-norse-mythology-thor",
    language: "en",
    category: CATEGORY_LEGACY["故事"],
    category_v2: "故事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "story-grimm-rapunzel",
    language: "en",
    category: CATEGORY_LEGACY["故事"],
    category_v2: "故事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 10 — 人物 (10) ----------
  topic({
    topic_key: "bio-marie-curie",
    language: "en",
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-einstein",
    language: "en",
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-helen-keller",
    language: "en",
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-darwin",
    language: "en",
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-tu-youyou",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-qian-xuesen",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-zhang-qian-explorer",
    language: "zh",
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-elon-musk",
    language: "en",
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-steve-jobs",
    language: "en",
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "bio-nelson-mandela",
    language: "en",
    category: CATEGORY_LEGACY["人物"],
    category_v2: "人物",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 11 — 科学 (10) ----------
  topic({
    topic_key: "sci-solar-system",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-states-of-matter",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-photosynthesis",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-electromagnetism",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-genetics-dna",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-evolution-darwin",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-plate-tectonics",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-volcanoes-and-earthquakes",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-water-cycle",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sci-light-spectrum",
    language: "en",
    category: CATEGORY_LEGACY["科学"],
    category_v2: "科学",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 12 — 数码与AI (8) ----------
  topic({
    topic_key: "digital-computer-history",
    language: "en",
    category: CATEGORY_LEGACY["数码与AI"],
    category_v2: "数码与AI",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "digital-how-internet-works",
    language: "en",
    category: CATEGORY_LEGACY["数码与AI"],
    category_v2: "数码与AI",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "digital-ai-history-overview",
    language: "en",
    category: CATEGORY_LEGACY["数码与AI"],
    category_v2: "数码与AI",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "digital-how-chatgpt-works",
    language: "en",
    category: CATEGORY_LEGACY["数码与AI"],
    category_v2: "数码与AI",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "digital-alphago-and-go",
    language: "en",
    category: CATEGORY_LEGACY["数码与AI"],
    category_v2: "数码与AI",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "digital-cybersecurity-basics",
    language: "en",
    category: CATEGORY_LEGACY["数码与AI"],
    category_v2: "数码与AI",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "digital-vr-ar-explained",
    language: "en",
    category: CATEGORY_LEGACY["数码与AI"],
    category_v2: "数码与AI",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "digital-coding-introduction",
    language: "en",
    category: CATEGORY_LEGACY["数码与AI"],
    category_v2: "数码与AI",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 13 — 太空与天文 (8) ----------
  topic({
    topic_key: "space-moon-return-missions",
    language: "en",
    category: CATEGORY_LEGACY["太空与天文"],
    category_v2: "太空与天文",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "space-mars-exploration",
    language: "en",
    category: CATEGORY_LEGACY["太空与天文"],
    category_v2: "太空与天文",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "space-james-webb-telescope",
    language: "en",
    category: CATEGORY_LEGACY["太空与天文"],
    category_v2: "太空与天文",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "space-iss-life-aboard",
    language: "en",
    category: CATEGORY_LEGACY["太空与天文"],
    category_v2: "太空与天文",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "space-spacex-falcon",
    language: "en",
    category: CATEGORY_LEGACY["太空与天文"],
    category_v2: "太空与天文",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "space-black-holes",
    language: "en",
    category: CATEGORY_LEGACY["太空与天文"],
    category_v2: "太空与天文",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(6, 8),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "space-exoplanets",
    language: "en",
    category: CATEGORY_LEGACY["太空与天文"],
    category_v2: "太空与天文",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "space-china-space-program",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["太空与天文"],
    category_v2: "太空与天文",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 14 — 医学健康 (8) ----------
  topic({
    topic_key: "health-immune-system",
    language: "en",
    category: CATEGORY_LEGACY["医学健康"],
    category_v2: "医学健康",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "health-vaccine-history",
    language: "en",
    category: CATEGORY_LEGACY["医学健康"],
    category_v2: "医学健康",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "health-penicillin-discovery",
    language: "en",
    category: CATEGORY_LEGACY["医学健康"],
    category_v2: "医学健康",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "health-heart-and-blood",
    language: "en",
    category: CATEGORY_LEGACY["医学健康"],
    category_v2: "医学健康",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "health-the-brain-explained",
    language: "en",
    category: CATEGORY_LEGACY["医学健康"],
    category_v2: "医学健康",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "health-sleep-science",
    language: "en",
    category: CATEGORY_LEGACY["医学健康"],
    category_v2: "医学健康",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "health-nutrition-basics",
    language: "en",
    category: CATEGORY_LEGACY["医学健康"],
    category_v2: "医学健康",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "health-mental-health-stress",
    language: "en",
    category: CATEGORY_LEGACY["医学健康"],
    category_v2: "医学健康",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: "L5", // §0.1 Q2 G3 block (mental-health)
    content_warnings: ["mature"],
  }),

  // ---------- Cat 15 — 时事 (5 evergreen placeholders) ----------
  topic({
    topic_key: "news-evergreen-ocean-plastic",
    language: "en",
    category: CATEGORY_LEGACY["时事"],
    category_v2: "时事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "news-evergreen-renewable-energy",
    language: "en",
    category: CATEGORY_LEGACY["时事"],
    category_v2: "时事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "news-evergreen-ai-in-school",
    language: "en",
    category: CATEGORY_LEGACY["时事"],
    category_v2: "时事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "news-evergreen-wildlife-2020s",
    language: "en",
    category: CATEGORY_LEGACY["时事"],
    category_v2: "时事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "news-evergreen-climate-action",
    language: "en",
    category: CATEGORY_LEGACY["时事"],
    category_v2: "时事",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 16 — 体育 (8) ----------
  topic({
    topic_key: "sports-olympics-history",
    language: "en",
    category: CATEGORY_LEGACY["体育"],
    category_v2: "体育",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sports-china-olympics-2008-2022",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["体育"],
    category_v2: "体育",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sports-fifa-world-cup",
    language: "en",
    category: CATEGORY_LEGACY["体育"],
    category_v2: "体育",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sports-nba-basketball",
    language: "en",
    category: CATEGORY_LEGACY["体育"],
    category_v2: "体育",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sports-tennis-grand-slams",
    language: "en",
    category: CATEGORY_LEGACY["体育"],
    category_v2: "体育",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sports-tai-chi-martial-arts",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["体育"],
    category_v2: "体育",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sports-physics-of-sports",
    language: "en",
    category: CATEGORY_LEGACY["体育"],
    category_v2: "体育",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "sports-marathon-and-endurance",
    language: "en",
    category: CATEGORY_LEGACY["体育"],
    category_v2: "体育",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 17 — 环保 (8) ----------
  topic({
    topic_key: "env-climate-change-basics",
    language: "en",
    category: CATEGORY_LEGACY["环保"],
    category_v2: "环保",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "env-electric-vehicles",
    language: "en",
    category: CATEGORY_LEGACY["环保"],
    category_v2: "环保",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "env-solar-and-wind-power",
    language: "en",
    category: CATEGORY_LEGACY["环保"],
    category_v2: "环保",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "env-recycling-and-zero-waste",
    language: "en",
    category: CATEGORY_LEGACY["环保"],
    category_v2: "环保",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "env-endangered-species",
    language: "en",
    category: CATEGORY_LEGACY["环保"],
    category_v2: "环保",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "env-deforestation",
    language: "en",
    category: CATEGORY_LEGACY["环保"],
    category_v2: "环保",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "env-china-environmental-action",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["环保"],
    category_v2: "环保",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(5, 7),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "env-cities-going-green",
    language: "en",
    category: CATEGORY_LEGACY["环保"],
    category_v2: "环保",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),

  // ---------- Cat 18 — 自然生态 (8) ----------
  topic({
    topic_key: "nature-rainforest-ecosystems",
    language: "en",
    category: CATEGORY_LEGACY["自然生态"],
    category_v2: "自然生态",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "nature-coral-reefs",
    language: "en",
    category: CATEGORY_LEGACY["自然生态"],
    category_v2: "自然生态",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "nature-deserts-life",
    language: "en",
    category: CATEGORY_LEGACY["自然生态"],
    category_v2: "自然生态",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(3, 5),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "nature-tundra-arctic",
    language: "en",
    category: CATEGORY_LEGACY["自然生态"],
    category_v2: "自然生态",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "nature-china-yellow-mountains",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["自然生态"],
    category_v2: "自然生态",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "nature-china-jiuzhaigou",
    language: "zh", // §0.1 Q6
    category: CATEGORY_LEGACY["自然生态"],
    category_v2: "自然生态",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "nature-yellowstone-national-park",
    language: "en",
    category: CATEGORY_LEGACY["自然生态"],
    category_v2: "自然生态",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
  topic({
    topic_key: "nature-grand-canyon",
    language: "en",
    category: CATEGORY_LEGACY["自然生态"],
    category_v2: "自然生态",
    pack_id: null,
    pack_order: null,
    recommended_levels: levelRange(4, 6),
    age_min_level: null,
    content_warnings: [],
  }),
];

// ---------------------------------------------------------------------------
// Sanity self-check (runs on import; cheap, no I/O)
// ---------------------------------------------------------------------------

(function selfCheck() {
  const known = new Set(TOPIC_PACKS.map((p) => p.pack_id));
  for (const t of TOPICS) {
    if (t.pack_id && !known.has(t.pack_id)) {
      throw new Error(
        `Topic ${t.topic_key} references unknown pack_id=${t.pack_id}`
      );
    }
    if (!CATEGORIES_V2.includes(t.category_v2 as (typeof CATEGORIES_V2)[number])) {
      throw new Error(
        `Topic ${t.topic_key} has invalid category_v2=${t.category_v2}`
      );
    }
    if (t.recommended_levels.length === 0) {
      throw new Error(`Topic ${t.topic_key} has empty recommended_levels`);
    }
  }
  // Ensure topic_key uniqueness within (topic_key, language) — match 035 UNIQUE
  const seen = new Set<string>();
  for (const t of TOPICS) {
    const k = `${t.topic_key}::${t.language}`;
    if (seen.has(k)) throw new Error(`Duplicate (topic_key,language): ${k}`);
    seen.add(k);
  }
})();

// ---------------------------------------------------------------------------
// Reporting (dry-run)
// ---------------------------------------------------------------------------

function printDryRunSummary() {
  const byLang = { zh: 0, en: 0 };
  const byCat: Record<string, number> = {};
  for (const c of CATEGORIES_V2) byCat[c] = 0;
  const byLevel: Record<string, number> = {};
  for (let i = 1; i <= 12; i++) byLevel[`L${i}`] = 0;
  let blocked = 0;
  const blockedList: string[] = [];

  for (const t of TOPICS) {
    byLang[t.language] += 1;
    byCat[t.category_v2] = (byCat[t.category_v2] ?? 0) + 1;
    for (const lv of t.recommended_levels) {
      if (byLevel[lv] !== undefined) byLevel[lv] += 1;
    }
    if (t.age_min_level) {
      blocked += 1;
      const minNum = parseInt(t.age_min_level.replace(/^L/, ""), 10);
      blockedList.push(
        `  - ${t.topic_key} (G${minNum}) — ${t.category_v2}`
      );
    }
  }

  console.log("=== Topic Matrix Seed (dry-run) ===");
  console.log(`Packs: ${TOPIC_PACKS.length}`);
  console.log(`Topics: ${TOPICS.length}`);
  console.log("By language:");
  console.log(`  zh: ${byLang.zh}`);
  console.log(`  en: ${byLang.en}`);
  console.log("By category_v2:");
  for (const c of CATEGORIES_V2) {
    console.log(`  ${c}: ${byCat[c]}`);
  }
  console.log(
    "By recommended-level coverage (count of topics whose recommended_levels intersects each level):"
  );
  const levelLine = Array.from({ length: 12 }, (_, i) => {
    const k = `L${i + 1}`;
    return `${k}: ${byLevel[k]}`;
  }).join(", ");
  console.log(`  ${levelLine}`);
  console.log(`Blocked topics (age_min_level set): ${blocked}`);
  for (const line of blockedList) console.log(line);
}

// ---------------------------------------------------------------------------
// Execute (upsert)
// ---------------------------------------------------------------------------

async function executeUpsert() {
  // Dynamic import so .env.local is available before module evaluation, and
  // dry-run does not require Supabase env vars.
  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const supabase = await createServiceRoleClient();

  // 1) Upsert topic_packs FIRST (FK requirement on reading_topics.pack_id)
  console.log(`Upserting ${TOPIC_PACKS.length} topic_packs...`);
  for (const p of TOPIC_PACKS) {
    const { error } = await supabase
      .from("topic_packs")
      .upsert(
        {
          pack_id: p.pack_id,
          pack_name_zh: p.pack_name_zh,
          pack_name_en: p.pack_name_en,
          category: p.category,
          language: p.language,
          recommended_levels: p.recommended_levels,
          description: p.description ?? null,
        },
        { onConflict: "pack_id" }
      );
    if (error) {
      console.error(`Failed to upsert pack ${p.pack_id}:`, error.message);
      process.exit(1);
    }
  }
  console.log(`  topic_packs upsert OK`);

  // 2) Upsert reading_topics (onConflict matches 035 UNIQUE on topic_key+language)
  console.log(`Upserting ${TOPICS.length} reading_topics...`);
  for (const t of TOPICS) {
    const { error } = await supabase
      .from("reading_topics")
      .upsert(
        {
          topic_key: t.topic_key,
          language: t.language,
          category: t.category,
          category_v2: t.category_v2,
          pack_id: t.pack_id,
          pack_order: t.pack_order,
          recommended_levels: t.recommended_levels,
          target_grades: t.target_grades,
          age_min_level: t.age_min_level,
          content_warnings: t.content_warnings,
          source_text: t.source_text,
          source_url: t.source_url,
          status: t.status,
        },
        { onConflict: "topic_key,language" }
      );
    if (error) {
      console.error(`Failed to upsert topic ${t.topic_key}:`, error.message);
      process.exit(1);
    }
  }
  console.log(`  reading_topics upsert OK`);

  console.log("=== Execute complete ===");
  console.log(`Packs upserted: ${TOPIC_PACKS.length}`);
  console.log(`Topics upserted: ${TOPICS.length}`);
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const dryRun = args.includes("--dry-run") || !execute; // default: dry-run

  if (execute && dryRun && args.includes("--execute") && args.includes("--dry-run")) {
    console.error("Error: pass either --dry-run or --execute, not both.");
    process.exit(2);
  }

  if (execute) {
    await executeUpsert();
    process.exit(0);
  }

  printDryRunSummary();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed script crashed:", err);
  process.exit(1);
});

// rollback hint:
//   -- Clear v2-extension fields on rows seeded by this script (keeps row, drops pack linkage):
//   UPDATE reading_topics
//      SET pack_id = NULL,
//          pack_order = NULL,
//          recommended_levels = '{}',
//          category_v2 = NULL,
//          age_min_level = NULL,
//          content_warnings = '{}'
//    WHERE topic_key LIKE 'zh-history-%' OR topic_key LIKE 'us-history-%'
//       OR topic_key LIKE 'world-history-%' OR topic_key LIKE 'lit-%'
//       OR topic_key LIKE 'poetry-%' OR topic_key LIKE 'culture-%'
//       OR topic_key LIKE 'art-%' OR topic_key LIKE 'econ-%'
//       OR topic_key LIKE 'story-%' OR topic_key LIKE 'bio-%'
//       OR topic_key LIKE 'sci-%' OR topic_key LIKE 'digital-%'
//       OR topic_key LIKE 'space-%' OR topic_key LIKE 'health-%'
//       OR topic_key LIKE 'news-evergreen-%' OR topic_key LIKE 'sports-%'
//       OR topic_key LIKE 'env-%' OR topic_key LIKE 'nature-%';
//   -- Drop seeded packs (this script owns these pack_ids):
//   DELETE FROM topic_packs WHERE pack_id IN (
//     'china-foundations','china-empire','china-three-kingdoms','china-tang',
//     'china-ming','china-modern','china-contemporary',
//     'us-colonial','us-revolution','us-civil-war','us-westward','us-20c','us-tech',
//     'ancient-civilizations','classical-antiquity','medieval','early-modern','modern'
//   );
