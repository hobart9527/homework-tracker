import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TYPE_GROUPS, DEFAULT_TYPES } from "@/lib/homework-types";
import type { Database } from "@/lib/supabase/types";

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

  // Fetch all type bindings for enriched metadata
  const { data: bindingsData } = await supabase
    .from("homework_type_bindings")
    .select("type_id, allowed_platforms, match_keywords");

  // Build a lookup map for bindings
  const bindingMap: Record<
    string,
    { allowed_platforms: string[]; match_keywords: string[] }
  > = {};
  if (bindingsData) {
    for (const b of bindingsData) {
      bindingMap[b.type_id] = {
        allowed_platforms: b.allowed_platforms || [],
        match_keywords: b.match_keywords || [],
      };
    }
  }

  // Build default types with binding data and mapped group_id
  const groupIdToName: Record<string, string> = {};
  for (const g of DEFAULT_TYPE_GROUPS) {
    groupIdToName[g.id] = g.name;
  }

  const defaultTypes = DEFAULT_TYPES.map((t) => {
    const binding = bindingMap[t.id];
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
