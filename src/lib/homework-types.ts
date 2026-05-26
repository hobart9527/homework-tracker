export type TypeGroup = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
};

export type DefaultType = {
  id: string;
  name: string;
  icon: string;
  default_points: number;
  group_id: string;
};

export const DEFAULT_TYPE_GROUPS: TypeGroup[] = [
  { id: "group_english", name: "英文", icon: "🔤", sort_order: 0 },
  { id: "group_chinese", name: "中文", icon: "🇨🇳", sort_order: 1 },
  { id: "group_math", name: "数学", icon: "📐", sort_order: 2 },
  { id: "group_interest", name: "兴趣", icon: "🎨", sort_order: 3 },
  { id: "group_custom", name: "自定义", icon: "✨", sort_order: 4 },
];

export const STATIC_TYPE_BINDINGS: Record<string, { allowed_platforms: string[]; match_keywords: string[] }> = {
  english_reading: { allowed_platforms: ["raz-kids", "epic", "khan-academy"], match_keywords: ["reading", "read", "phonics", "book", "story", "literacy"] },
  english_course: { allowed_platforms: ["khan-academy", "ixl"], match_keywords: ["course", "lesson", "grammar", "vocabulary", "ela", "language arts", "writing", "listening"] },
  english_practice: { allowed_platforms: ["ixl", "khan-academy"], match_keywords: ["practice", "exercise", "worksheet", "quiz", "test", "spelling", "drill"] },
  english_custom: { allowed_platforms: [], match_keywords: ["english", "英文"] },
  chinese_reading: { allowed_platforms: [], match_keywords: ["阅读", "read", "朗读", "中文", "故事", "古诗", "经典"] },
  chinese_course: { allowed_platforms: [], match_keywords: ["课程", "course", "lesson", "grammar", "写作", "语文"] },
  chinese_practice: { allowed_platforms: [], match_keywords: ["练习", "practice", "exercise", "worksheet", "生字", "字词", "听写"] },
  chinese_custom: { allowed_platforms: [], match_keywords: ["中文", "Chinese", "语文"] },
  math_practice: { allowed_platforms: ["ixl", "khan-academy"], match_keywords: ["math", "mathematics", "数学", "algebra", "geometry", "arithmetic", "calculation"] },
  math_course: { allowed_platforms: ["khan-academy", "ixl"], match_keywords: ["math", "mathematics", "数学", "course", "lesson"] },
  math_custom: { allowed_platforms: [], match_keywords: ["math", "数学"] },
  interest_piano: { allowed_platforms: [], match_keywords: ["piano", "钢琴", "keyboard", "keys"] },
  interest_vocal: { allowed_platforms: [], match_keywords: ["vocal", "singing", "声乐", "唱歌", "voice"] },
  interest_ea: { allowed_platforms: [], match_keywords: ["drama", "theatre", "theater", "ea", "表演", "acting"] },
  interest_dance: { allowed_platforms: [], match_keywords: ["dance", "dancing", "舞蹈", "ballet", "芭蕾"] },
  interest_drums: { allowed_platforms: [], match_keywords: ["drum", "drumming", "架子鼓", "percussion"] },
  interest_custom: { allowed_platforms: [], match_keywords: ["interest", "兴趣"] },
};

export const DEFAULT_TYPES: DefaultType[] = [
  { id: "english_reading", name: "阅读", icon: "📚", default_points: 5, group_id: "group_english" },
  { id: "english_course", name: "课程", icon: "💻", default_points: 4, group_id: "group_english" },
  { id: "english_practice", name: "练习", icon: "📝", default_points: 4, group_id: "group_english" },
  { id: "english_custom", name: "自定义", icon: "📝", default_points: 3, group_id: "group_english" },
  { id: "chinese_reading", name: "阅读", icon: "📖", default_points: 3, group_id: "group_chinese" },
  { id: "chinese_practice", name: "练习", icon: "📝", default_points: 3, group_id: "group_chinese" },
  { id: "chinese_course", name: "课程", icon: "💻", default_points: 4, group_id: "group_chinese" },
  { id: "chinese_custom", name: "自定义", icon: "📝", default_points: 3, group_id: "group_chinese" },
  { id: "math_practice", name: "练习", icon: "🧮", default_points: 4, group_id: "group_math" },
  { id: "math_course", name: "课程", icon: "💻", default_points: 4, group_id: "group_math" },
  { id: "math_custom", name: "自定义", icon: "📝", default_points: 3, group_id: "group_math" },
  { id: "interest_piano", name: "钢琴", icon: "🎹", default_points: 6, group_id: "group_interest" },
  { id: "interest_vocal", name: "声乐", icon: "🎤", default_points: 4, group_id: "group_interest" },
  { id: "interest_ea", name: "EA", icon: "🎭", default_points: 4, group_id: "group_interest" },
  { id: "interest_dance", name: "舞蹈", icon: "🩰", default_points: 6, group_id: "group_interest" },
  { id: "interest_drums", name: "架子鼓", icon: "🥁", default_points: 6, group_id: "group_interest" },
  { id: "interest_custom", name: "自定义", icon: "📝", default_points: 3, group_id: "group_interest" },
];
