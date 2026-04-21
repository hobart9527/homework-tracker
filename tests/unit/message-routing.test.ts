import { describe, expect, it } from "vitest";
import { pickMessageRoutingRule } from "@/lib/message-routing";

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
