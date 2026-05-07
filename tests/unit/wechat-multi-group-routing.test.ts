import { describe, expect, it } from "vitest";
import { resolveWeChatTarget } from "@/lib/wechat-target-resolver";
import {
  resolveMessageDeliveryTarget,
  pickMessageRoutingRule,
} from "@/lib/message-routing";

// ====================================================================
// Helper: mock supabase for resolveWeChatTarget (uses .single())
// ====================================================================

function mockResolver(
  tables: Record<string, Record<string, unknown> | null>
) {
  return {
    from: (table: string) => {
      const result = tables[table];
      if (result === undefined) {
        throw new Error(`Unexpected table query: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: result, error: null }),
          }),
        }),
      };
    },
  };
}

// ====================================================================
// Helper: mock supabase for resolveMessageDeliveryTarget
// (uses .maybeSingle() / .order())
// ====================================================================

function mockDelivery(overrides: {
  homeworks?: Record<string, unknown> | null;
  children?: Record<string, unknown> | null;
  wechat_groups?: Record<string, unknown> | null;
  message_routing_rules?: Record<string, unknown>[];
}) {
  return {
    from: (table: string) => {
      if (table === "homeworks") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: overrides.homeworks ?? null,
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
                data: overrides.children ?? null,
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
                data: overrides.wechat_groups ?? null,
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
                  data: overrides.message_routing_rules ?? [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table query: ${table}`);
    },
  };
}

// ====================================================================
// 1. resolveWeChatTarget 三级优先级
// ====================================================================

describe("resolveWeChatTarget 3-level precedence", () => {
  // 作业级 wechat_group_id 优先级最高
  it("uses homework-level wechat_group_id before child default", async () => {
    const supabase = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: "group-homework" },
      children: { default_wechat_group_id: "group-child" },
      wechat_groups: {
        recipient_ref: "wechat-group-hw",
        display_name: "数学老师群",
      },
    });

    const target = await resolveWeChatTarget({
      supabase: supabase as never,
      childId: "child-1",
      homeworkId: "hw-1",
    });

    expect(target).toEqual({
      channel: "wechat_group",
      recipientRef: "wechat-group-hw",
      recipientLabel: "数学老师群",
    });
  });

  // 孩子 default_wechat_group_id 次之
  it("falls back to child-level default_wechat_group_id when homework has none", async () => {
    const supabase = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: null },
      children: { default_wechat_group_id: "group-child" },
      wechat_groups: {
        recipient_ref: "wechat-group-child",
        display_name: "英语老师群",
      },
    });

    const target = await resolveWeChatTarget({
      supabase: supabase as never,
      childId: "child-2",
      homeworkId: "hw-2",
    });

    expect(target).toEqual({
      channel: "wechat_group",
      recipientRef: "wechat-group-child",
      recipientLabel: "英语老师群",
    });
  });

  // 两者都没有时返回 null
  it("returns null when both homework and child have no group", async () => {
    const supabase = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: null },
      children: { default_wechat_group_id: null },
    });

    const target = await resolveWeChatTarget({
      supabase: supabase as never,
      childId: "child-3",
      homeworkId: "hw-3",
    });

    expect(target).toBeNull();
  });

  // 作业级 send_to_wechat=false 时不发送（即使有 group_id）
  it("returns null when send_to_wechat is false even with wechat_group_id set", async () => {
    const supabase = mockResolver({
      homeworks: { send_to_wechat: false, wechat_group_id: "group-homework" },
      children: { default_wechat_group_id: null },
    });

    const target = await resolveWeChatTarget({
      supabase: supabase as never,
      childId: "child-4",
      homeworkId: "hw-4",
    });

    expect(target).toBeNull();
  });

  // send_to_wechat=false 时 homework 的 group 被忽略，但仍会降级到孩子默认群
  it("ignores homework group when send_to_wechat is false, but still falls through to child default", async () => {
    const supabase = mockResolver({
      homeworks: { send_to_wechat: false, wechat_group_id: "group-homework" },
      children: { default_wechat_group_id: "group-child" },
      wechat_groups: {
        recipient_ref: "wechat-group-child",
        display_name: "语文老师群",
      },
    });

    const target = await resolveWeChatTarget({
      supabase: supabase as never,
      childId: "child-5",
      homeworkId: "hw-5",
    });

    expect(target).toEqual({
      channel: "wechat_group",
      recipientRef: "wechat-group-child",
      recipientLabel: "语文老师群",
    });
  });

  // 群没有 display_name 时返回 recipientLabel 为 null
  it("returns null recipientLabel when wechat group has no display_name", async () => {
    const supabase = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: "group-noname" },
      children: { default_wechat_group_id: null },
      wechat_groups: {
        recipient_ref: "wechat-group-noname",
        display_name: null,
      },
    });

    const target = await resolveWeChatTarget({
      supabase: supabase as never,
      childId: "child-6",
      homeworkId: "hw-6",
    });

    expect(target).toEqual({
      channel: "wechat_group",
      recipientRef: "wechat-group-noname",
      recipientLabel: null,
    });
  });

  // 群不存在（data 为 null）时返回 null
  it("returns null when the resolved wechat group record is not found", async () => {
    const supabase = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: "group-deleted" },
      children: { default_wechat_group_id: null },
      wechat_groups: null,
    });

    const target = await resolveWeChatTarget({
      supabase: supabase as never,
      childId: "child-7",
      homeworkId: "hw-7",
    });

    expect(target).toBeNull();
  });
});

// ====================================================================
// 2. resolveMessageDeliveryTarget 三级优先级
//    补充测试：已有测试覆盖 homework > child default，这里补全兜底路径
// ====================================================================

describe("resolveMessageDeliveryTarget 3-level precedence", () => {
  // 遗留 message_routing_rules 兜底
  it("falls back to legacy message_routing_rules when homework and child have no group", async () => {
    const supabase = mockDelivery({
      homeworks: { id: "hw-1", child_id: "child-1", send_to_wechat: true, wechat_group_id: null },
      children: { id: "child-1", default_wechat_group_id: null },
      message_routing_rules: [
        {
          id: "legacy-rule",
          child_id: "child-1",
          homework_id: null,
          channel: "wechat_group",
          recipient_ref: "legacy-wechat-ref",
          recipient_label: "遗留默认群",
          created_at: "2026-04-01T10:00:00.000Z",
        },
      ],
    });

    const target = await resolveMessageDeliveryTarget({
      supabase: supabase as never,
      childId: "child-1",
      homeworkId: "hw-1",
      channel: "wechat_group",
    });

    expect(target).toEqual({
      channel: "wechat_group",
      recipientRef: "legacy-wechat-ref",
      recipientLabel: "遗留默认群",
    });
  });

  // 都没有时返回 null
  it("returns null when all three levels are empty", async () => {
    const supabase = mockDelivery({
      homeworks: { id: "hw-2", child_id: "child-2", send_to_wechat: true, wechat_group_id: null },
      children: { id: "child-2", default_wechat_group_id: null },
      message_routing_rules: [],
    });

    const target = await resolveMessageDeliveryTarget({
      supabase: supabase as never,
      childId: "child-2",
      homeworkId: "hw-2",
      channel: "wechat_group",
    });

    expect(target).toBeNull();
  });

  // telegram_channel 不走 wechat_group_id 逻辑，直接使用 message_routing_rules
  it("uses message_routing_rules directly for telegram_channel, bypassing wechat group logic", async () => {
    const supabase = mockDelivery({
      message_routing_rules: [
        {
          id: "rule-tg",
          child_id: "child-3",
          homework_id: "hw-3",
          channel: "telegram_chat",
          recipient_ref: "-1001234567890",
          recipient_label: "家长电报群",
          created_at: "2026-04-01T10:00:00.000Z",
        },
      ],
    });

    const target = await resolveMessageDeliveryTarget({
      supabase: supabase as never,
      childId: "child-3",
      homeworkId: "hw-3",
      channel: "telegram_chat",
    });

    expect(target).toEqual({
      channel: "telegram_chat",
      recipientRef: "-1001234567890",
      recipientLabel: "家长电报群",
    });
  });

  // telegram_channel 且没有匹配规则时返回 null
  it("returns null for telegram_channel with no matching rules", async () => {
    const supabase = mockDelivery({
      message_routing_rules: [],
    });

    const target = await resolveMessageDeliveryTarget({
      supabase: supabase as never,
      childId: "child-4",
      homeworkId: "hw-4",
      channel: "telegram_chat",
    });

    expect(target).toBeNull();
  });

  // homework-specific routing rule overrides child default in legacy rules
  it("homework-specific legacy routing rule takes priority over child-default legacy rule", async () => {
    const supabase = mockDelivery({
      homeworks: { id: "hw-5", child_id: "child-5", send_to_wechat: true, wechat_group_id: null },
      children: { id: "child-5", default_wechat_group_id: null },
      message_routing_rules: [
        {
          id: "rule-default",
          child_id: "child-5",
          homework_id: null,
          channel: "wechat_group",
          recipient_ref: "legacy-default",
          recipient_label: "默认群",
          created_at: "2026-04-01T10:00:00.000Z",
        },
        {
          id: "rule-hw",
          child_id: "child-5",
          homework_id: "hw-5",
          channel: "wechat_group",
          recipient_ref: "legacy-hw-specific",
          recipient_label: "作业专属群",
          created_at: "2026-04-01T09:00:00.000Z",
        },
      ],
    });

    const target = await resolveMessageDeliveryTarget({
      supabase: supabase as never,
      childId: "child-5",
      homeworkId: "hw-5",
      channel: "wechat_group",
    });

    expect(target).toEqual({
      channel: "wechat_group",
      recipientRef: "legacy-hw-specific",
      recipientLabel: "作业专属群",
    });
  });
});

// ====================================================================
// 3. 多群场景
// ====================================================================

describe("multi-group scenarios", () => {
  // 不同孩子可以有不同的默认群
  it("different children resolve to different default groups", async () => {
    // Child A -> 语文老师群
    const supabaseA = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: null },
      children: { default_wechat_group_id: "group-chinese" },
      wechat_groups: { recipient_ref: "group-chinese-ref", display_name: "语文老师群" },
    });
    const targetA = await resolveWeChatTarget({
      supabase: supabaseA as never,
      childId: "child-a",
      homeworkId: "hw-a1",
    });
    expect(targetA?.recipientRef).toBe("group-chinese-ref");
    expect(targetA?.recipientLabel).toBe("语文老师群");

    // Child B -> 数学老师群
    const supabaseB = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: null },
      children: { default_wechat_group_id: "group-math" },
      wechat_groups: { recipient_ref: "group-math-ref", display_name: "数学老师群" },
    });
    const targetB = await resolveWeChatTarget({
      supabase: supabaseB as never,
      childId: "child-b",
      homeworkId: "hw-b1",
    });
    expect(targetB?.recipientRef).toBe("group-math-ref");
    expect(targetB?.recipientLabel).toBe("数学老师群");
  });

  // 不同作业可以覆盖到不同的群
  it("different homeworks for the same child can override to different groups", async () => {
    // Homework-A2 overrides to 英语老师群 instead of the default 语文老师群
    const supabaseOverride = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: "group-english" },
      children: { default_wechat_group_id: "group-chinese" },
      wechat_groups: { recipient_ref: "group-english-ref", display_name: "英语老师群" },
    });
    const target = await resolveWeChatTarget({
      supabase: supabaseOverride as never,
      childId: "child-a",
      homeworkId: "hw-a2",
    });
    expect(target?.recipientRef).toBe("group-english-ref");
    expect(target?.recipientLabel).toBe("英语老师群");

    // Homework-A3 uses the child default 语文老师群 (no override)
    const supabaseDefault = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: null },
      children: { default_wechat_group_id: "group-chinese" },
      wechat_groups: { recipient_ref: "group-chinese-ref", display_name: "语文老师群" },
    });
    const targetDefault = await resolveWeChatTarget({
      supabase: supabaseDefault as never,
      childId: "child-a",
      homeworkId: "hw-a3",
    });
    expect(targetDefault?.recipientRef).toBe("group-chinese-ref");
    expect(targetDefault?.recipientLabel).toBe("语文老师群");
  });

  // 一个群可以被多个孩子引用（通过 default_wechat_group_id + resolveMessageDeliveryTarget）
  it("a single wechat group can be the default for multiple children", async () => {
    // 同一个群 "group-science" 同时是两个孩子的默认群
    const groupData = { recipient_ref: "science-group-ref", display_name: "科学老师群" };

    // Child X: homework has no group, child default points to group-science
    const supabaseX = mockDelivery({
      homeworks: { id: "hw-x", child_id: "child-x", send_to_wechat: true, wechat_group_id: null },
      children: { id: "child-x", default_wechat_group_id: "group-science" },
      wechat_groups: groupData,
      message_routing_rules: [],
    });
    const targetX = await resolveMessageDeliveryTarget({
      supabase: supabaseX as never,
      childId: "child-x",
      homeworkId: "hw-x",
      channel: "wechat_group",
    });
    expect(targetX?.recipientRef).toBe("science-group-ref");
    expect(targetX?.recipientLabel).toBe("科学老师群");

    // Child Y: same setup, same default group
    const supabaseY = mockDelivery({
      homeworks: { id: "hw-y", child_id: "child-y", send_to_wechat: true, wechat_group_id: null },
      children: { id: "child-y", default_wechat_group_id: "group-science" },
      wechat_groups: groupData,
      message_routing_rules: [],
    });
    const targetY = await resolveMessageDeliveryTarget({
      supabase: supabaseY as never,
      childId: "child-y",
      homeworkId: "hw-y",
      channel: "wechat_group",
    });
    expect(targetY?.recipientRef).toBe("science-group-ref");
    expect(targetY?.recipientLabel).toBe("科学老师群");
  });

  // 一个群可以被多个作业引用（通过 homework wechat_group_id）
  it("a single wechat group can be referenced by multiple homeworks", async () => {
    const groupData = { recipient_ref: "shared-group-ref", display_name: "共享通知群" };

    // Homework P1 -> shared group
    const supabase1 = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: "group-shared" },
      children: { default_wechat_group_id: null },
      wechat_groups: groupData,
    });
    const target1 = await resolveWeChatTarget({
      supabase: supabase1 as never,
      childId: "child-p",
      homeworkId: "hw-p1",
    });
    expect(target1?.recipientRef).toBe("shared-group-ref");

    // Homework P2 -> same shared group
    const supabase2 = mockResolver({
      homeworks: { send_to_wechat: true, wechat_group_id: "group-shared" },
      children: { default_wechat_group_id: null },
      wechat_groups: groupData,
    });
    const target2 = await resolveWeChatTarget({
      supabase: supabase2 as never,
      childId: "child-p",
      homeworkId: "hw-p2",
    });
    expect(target2?.recipientRef).toBe("shared-group-ref");
  });
});
