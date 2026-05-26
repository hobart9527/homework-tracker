import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TYPE_GROUPS, DEFAULT_TYPES } from "@/lib/homework-types";
import type { Database } from "@/lib/supabase/types";

/**
 * Built-in platform binding fallback when homework_type_bindings table
 * has no seed data yet (e.g. migration not applied on this project).
 * Each default type that supports platform binding is listed here.
 */
const STATIC_TYPE_BINDINGS: Record<string, { allowed_platforms: string[]; match_keywords: string[] }> = {
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

export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parentId = session.user.id;

  // Fetch custom groups for this parent
  const { data: groupsData } = await supabase
    .from("homework_type_groups")
    .select("*")
    .eq("parent_id", parentId)
    .order("sort_order", { ascending: true });

  const groups =
    groupsData && groupsData.length > 0
      ? (groupsData as Database["public"]["Tables"]["homework_type_groups"]["Row"][])
      : DEFAULT_TYPE_GROUPS;

  // Build name-to-DB-UUID map from DB groups
  const nameToDbId: Record<string, string> = {};
  if (groupsData && groupsData.length > 0) {
    for (const g of groupsData) {
      nameToDbId[g.name] = g.id;
    }
  }

  // Fetch custom types for this parent
  const { data: customTypesData } = await supabase
    .from("custom_homework_types")
    .select("*")
    .eq("parent_id", parentId);

  // Try DB bindings first, fall back to static
  const { data: bindingsData } = await supabase
    .from("homework_type_bindings")
    .select("type_id, allowed_platforms, match_keywords");

  const bindingMap: Record<
    string,
    { allowed_platforms: string[]; match_keywords: string[] }
  > = {};
  if (bindingsData && bindingsData.length > 0) {
    for (const b of bindingsData) {
      bindingMap[b.type_id] = {
        allowed_platforms: b.allowed_platforms || [],
        match_keywords: b.match_keywords || [],
      };
    }
  }

  // Build default types with binding data (DB > static fallback)
  const groupIdToName: Record<string, string> = {};
  for (const g of DEFAULT_TYPE_GROUPS) {
    groupIdToName[g.id] = g.name;
  }

  const defaultTypes = DEFAULT_TYPES.map((t) => {
    const binding = bindingMap[t.id] ?? STATIC_TYPE_BINDINGS[t.id];
    const groupName = groupIdToName[t.group_id] || "";
    return {
      id: t.id,
      name: t.name,
      icon: t.icon,
      default_points: t.default_points,
      group_id: (nameToDbId[groupName] || t.group_id) as string,
      is_custom: false as const,
      allowed_platforms: binding?.allowed_platforms ?? [],
      match_keywords: binding?.match_keywords ?? [],
    };
  });

  // Build custom types with binding data
  const customTypes = (customTypesData || []).map((t) => {
    const binding = bindingMap[t.id];
    return {
      id: t.id,
      name: t.name,
      icon: t.icon || "📝",
      default_points: t.default_points,
      group_id: nameToDbId["自定义"] || "group_custom",
      is_custom: true as const,
      allowed_platforms: binding?.allowed_platforms ?? [],
      match_keywords: binding?.match_keywords ?? [],
    };
  });

  const types = [...defaultTypes, ...customTypes];

  return NextResponse.json({ groups, types });
}
