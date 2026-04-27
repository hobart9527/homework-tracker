export type MessageRoutingChannel = "wechat_group" | "telegram_chat";

type WeChatGroupRecord = {
  id: string;
  recipient_ref: string;
  display_name: string | null;
};

type HomeworkWechatTargetRecord = {
  id: string;
  child_id: string;
  send_to_wechat: boolean | null;
  wechat_group_id: string | null;
};

type ChildWechatDefaultRecord = {
  id: string;
  default_wechat_group_id: string | null;
};

export type MessageRoutingRuleRecord = {
  id: string;
  child_id: string;
  homework_id: string | null;
  channel: MessageRoutingChannel;
  recipient_ref: string;
  recipient_label: string | null;
  created_at: string;
};

export type MessageDeliveryTarget = {
  channel: MessageRoutingChannel;
  recipientRef: string;
  recipientLabel: string | null;
};

type SupabaseLike = {
  from: (table: string) => {
    select: (
      columns?: string
    ) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
        eq: (column: string, value: string) => {
          order: (
            column: string,
            options?: { ascending?: boolean }
          ) => Promise<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

async function loadWeChatGroupById(input: {
  supabase: SupabaseLike;
  groupId: string;
}) {
  const { data, error } = await input.supabase
    .from("wechat_groups")
    .select("id, recipient_ref, display_name")
    .eq("id", input.groupId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as WeChatGroupRecord | null;
}

export function pickMessageRoutingRule(input: {
  rules: MessageRoutingRuleRecord[];
  childId: string;
  homeworkId: string;
  channel: MessageRoutingChannel;
}) {
  const channelRules = input.rules.filter(
    (rule) =>
      rule.child_id === input.childId && rule.channel === input.channel
  );

  const homeworkRule = channelRules.find(
    (rule) => rule.homework_id === input.homeworkId
  );

  if (homeworkRule) {
    return homeworkRule;
  }

  return channelRules.find((rule) => rule.homework_id === null) ?? null;
}

export async function resolveMessageDeliveryTarget(input: {
  supabase: SupabaseLike;
  childId: string;
  homeworkId: string;
  channel: MessageRoutingChannel;
}) {
  if (input.channel === "wechat_group") {
    const { data: homeworkData, error: homeworkError } = await input.supabase
      .from("homeworks")
      .select("id, child_id, send_to_wechat, wechat_group_id")
      .eq("id", input.homeworkId)
      .maybeSingle();

    if (homeworkError) {
      throw new Error(homeworkError.message);
    }

    const homework = homeworkData as HomeworkWechatTargetRecord | null;

    if (homework?.send_to_wechat && homework.wechat_group_id) {
      const homeworkGroup = await loadWeChatGroupById({
        supabase: input.supabase,
        groupId: homework.wechat_group_id,
      });

      if (homeworkGroup) {
        return {
          channel: "wechat_group",
          recipientRef: homeworkGroup.recipient_ref,
          recipientLabel: homeworkGroup.display_name,
        } satisfies MessageDeliveryTarget;
      }
    }

    const { data: childData, error: childError } = await input.supabase
      .from("children")
      .select("id, default_wechat_group_id")
      .eq("id", input.childId)
      .maybeSingle();

    if (childError) {
      throw new Error(childError.message);
    }

    const child = childData as ChildWechatDefaultRecord | null;

    if (child?.default_wechat_group_id) {
      const childGroup = await loadWeChatGroupById({
        supabase: input.supabase,
        groupId: child.default_wechat_group_id,
      });

      if (childGroup) {
        return {
          channel: "wechat_group",
          recipientRef: childGroup.recipient_ref,
          recipientLabel: childGroup.display_name,
        } satisfies MessageDeliveryTarget;
      }
    }
  }

  const { data, error } = await input.supabase
    .from("message_routing_rules")
    .select("*")
    .eq("child_id", input.childId)
    .eq("channel", input.channel)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const selectedRule = pickMessageRoutingRule({
    rules: (data ?? []) as MessageRoutingRuleRecord[],
    childId: input.childId,
    homeworkId: input.homeworkId,
    channel: input.channel,
  });

  if (!selectedRule) {
    return null;
  }

  return {
    channel: selectedRule.channel,
    recipientRef: selectedRule.recipient_ref,
    recipientLabel: selectedRule.recipient_label,
  } satisfies MessageDeliveryTarget;
}
