import { describe, expect, it } from "vitest";
import {
  pickMessageRoutingRule,
  resolveMessageDeliveryTarget,
} from "@/lib/message-routing";

describe("pickMessageRoutingRule", () => {
  it("prefers homework-specific routing over the child default", () => {
    const selected = pickMessageRoutingRule({
      childId: "child-1",
      homeworkId: "hw-2",
      channel: "wechat_group",
      rules: [
        {
          id: "rule-default",
          child_id: "child-1",
          homework_id: null,
          channel: "wechat_group",
          recipient_ref: "wechat-default",
          recipient_label: "默认群",
          created_at: "2026-04-21T10:00:00.000Z",
        },
        {
          id: "rule-homework",
          child_id: "child-1",
          homework_id: "hw-2",
          channel: "wechat_group",
          recipient_ref: "wechat-homework",
          recipient_label: "数学群",
          created_at: "2026-04-21T09:00:00.000Z",
        },
      ],
    });

    expect(selected?.id).toBe("rule-homework");
  });

  it("falls back to the child default route when no homework-specific rule exists", () => {
    const selected = pickMessageRoutingRule({
      childId: "child-1",
      homeworkId: "hw-3",
      channel: "telegram_chat",
      rules: [
        {
          id: "rule-default",
          child_id: "child-1",
          homework_id: null,
          channel: "telegram_chat",
          recipient_ref: "-1001234567890",
          recipient_label: "家长群",
          created_at: "2026-04-21T10:00:00.000Z",
        },
      ],
    });

    expect(selected?.recipient_ref).toBe("-1001234567890");
  });
});

describe("resolveMessageDeliveryTarget", () => {
  it("prefers a homework-specific WeChat group over child defaults and legacy routing rules", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "homeworks") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "hw-1",
                    child_id: "child-1",
                    send_to_wechat: true,
                    wechat_group_id: "group-homework",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "children") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "child-1",
                    default_wechat_group_id: "group-child",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "wechat_groups") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "group-homework",
                    recipient_ref: "wechat-group-homework",
                    display_name: "数学老师群",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "message_routing_rules") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [
                      {
                        id: "legacy-default",
                        child_id: "child-1",
                        homework_id: null,
                        channel: "wechat_group",
                        recipient_ref: "legacy-wechat-default",
                        recipient_label: "旧默认群",
                        created_at: "2026-04-21T10:00:00.000Z",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const target = await resolveMessageDeliveryTarget({
      supabase: supabase as never,
      childId: "child-1",
      homeworkId: "hw-1",
      channel: "wechat_group",
    });

    expect(target).toEqual({
      channel: "wechat_group",
      recipientRef: "wechat-group-homework",
      recipientLabel: "数学老师群",
    });
  });

  it("falls back to the child default WeChat group before legacy routing rules", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "homeworks") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "hw-2",
                    child_id: "child-1",
                    send_to_wechat: true,
                    wechat_group_id: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "children") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "child-1",
                    default_wechat_group_id: "group-child",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "wechat_groups") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "group-child",
                    recipient_ref: "wechat-group-child",
                    display_name: "英语老师群",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "message_routing_rules") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [
                      {
                        id: "legacy-default",
                        child_id: "child-1",
                        homework_id: null,
                        channel: "wechat_group",
                        recipient_ref: "legacy-wechat-default",
                        recipient_label: "旧默认群",
                        created_at: "2026-04-21T10:00:00.000Z",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const target = await resolveMessageDeliveryTarget({
      supabase: supabase as never,
      childId: "child-1",
      homeworkId: "hw-2",
      channel: "wechat_group",
    });

    expect(target).toEqual({
      channel: "wechat_group",
      recipientRef: "wechat-group-child",
      recipientLabel: "英语老师群",
    });
  });
});
