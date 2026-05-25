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
