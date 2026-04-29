type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

type WeChatTarget = {
  channel: "wechat_group";
  recipientRef: string;
  recipientLabel: string | null;
} | null;

/**
 * Resolve WeChat delivery target using the new precedence model:
 * 1. homework-specific WeChat group (if send_to_wechat is true)
 * 2. child default WeChat group
 * 3. null (no delivery)
 */
export async function resolveWeChatTarget(input: {
  supabase: SupabaseLike;
  childId: string;
  homeworkId: string;
}): Promise<WeChatTarget> {
  // Step 1: Check homework-level override
  const { data: homework } = await input.supabase
    .from("homeworks")
    .select("send_to_wechat, wechat_group_id")
    .eq("id", input.homeworkId)
    .single();

  let groupId: string | null = null;

  if (homework?.send_to_wechat && homework?.wechat_group_id) {
    groupId = homework.wechat_group_id as string;
  }

  // Step 2: Fall back to child-level default
  if (!groupId) {
    const { data: child } = await input.supabase
      .from("children")
      .select("default_wechat_group_id")
      .eq("id", input.childId)
      .single();

    if (child?.default_wechat_group_id) {
      groupId = child.default_wechat_group_id as string;
    }
  }

  if (!groupId) {
    return null;
  }

  // Step 3: Resolve group_id to recipient_ref
  const { data: group } = await input.supabase
    .from("wechat_groups")
    .select("recipient_ref, display_name")
    .eq("id", groupId)
    .single();

  if (!group?.recipient_ref) {
    return null;
  }

  return {
    channel: "wechat_group",
    recipientRef: group.recipient_ref as string,
    recipientLabel: (group.display_name as string) || null,
  };
}
