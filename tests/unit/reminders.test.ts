import { describe, expect, it } from "vitest";
import { resolveReminderAction } from "@/lib/reminders";

describe("resolveReminderAction", () => {
  it("returns resolve_completed when completed is true", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T12:00:00.000Z",
      now: "2026-04-14T10:00:00.000Z",
      completed: true,
    })).toBe("resolve_completed");
  });

  it("returns escalate_call when 2 hours passed after sms and still incomplete", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T12:00:00.000Z",
      now: "2026-04-14T14:00:00.000Z",
      completed: false,
    })).toBe("escalate_call");
  });

  it("returns noop when sms sent but not yet 2 hours", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T12:00:00.000Z",
      now: "2026-04-14T11:00:00.000Z",
      completed: false,
    })).toBe("noop");
  });

  it("returns noop when no reminder sent yet", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: null,
      now: "2026-04-14T12:00:00.000Z",
      completed: false,
    })).toBe("noop");
  });
});
