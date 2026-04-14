import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReminderActionButton } from "@/components/parent/ReminderActionButton";
import { resolveReminderAction, buildReminderStateFromRow } from "@/lib/reminders";
import type { ParentReminderState } from "@/lib/parent-dashboard";

describe("ReminderActionButton", () => {
  it("renders green reminder button when no state", () => {
    render(<ReminderActionButton homeworkId="hw-1" childId="child-1" targetDate="2026-04-14" />);
    expect(screen.getByRole("button", { name: "🔔 提醒" })).toBeInTheDocument();
  });

  it("renders amber badge when sms sent", () => {
    const state: ParentReminderState = {
      homeworkId: "hw-1",
      targetDate: "2026-04-14",
      status: "sent_sms",
      escalateAfter: new Date(Date.now() + 3600000).toISOString(),
    };
    render(<ReminderActionButton homeworkId="hw-1" childId="child-1" targetDate="2026-04-14" state={state} />);
    expect(screen.getByText(/已短信提醒/i)).toBeInTheDocument();
  });

  it("renders red badge when escalated", () => {
    const state: ParentReminderState = {
      homeworkId: "hw-1",
      targetDate: "2026-04-14",
      status: "escalated_call",
      escalateAfter: null,
    };
    render(<ReminderActionButton homeworkId="hw-1" childId="child-1" targetDate="2026-04-14" state={state} />);
    expect(screen.getByText(/已电话提醒/i)).toBeInTheDocument();
  });
});

describe("resolveReminderAction", () => {
  it("returns resolve_completed when completed is true", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T12:00:00.000Z",
      now: "2026-04-14T10:00:00.000Z",
      completed: true,
    })).toBe("resolve_completed");
  });

  it("returns escalate_call when 45 minutes passed after sms and still incomplete", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T12:00:00.000Z",
      now: "2026-04-14T12:46:00.000Z",
      completed: false,
    })).toBe("escalate_call");
  });

  it("returns noop when sms sent but not yet 45 minutes", () => {
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

describe("buildReminderStateFromRow", () => {
  it("builds reminder state from DB row", () => {
    const result = buildReminderStateFromRow({
      homework_id: "hw-1",
      target_date: "2026-04-14",
      status: "sent_sms",
      escalate_after: "2026-04-14T14:00:00.000Z",
    });
    expect(result.homeworkId).toBe("hw-1");
    expect(result.targetDate).toBe("2026-04-14");
    expect(result.status).toBe("sent_sms");
    expect(result.escalateAfter).toBe("2026-04-14T14:00:00.000Z");
  });
});
