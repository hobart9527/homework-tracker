export type MessageRoutingChannel = "wechat_group" | "telegram_chat";

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
    select: (columns?: string) => {
      eq: (column: string, value: string) => {
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
