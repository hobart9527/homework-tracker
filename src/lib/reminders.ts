import type { ParentReminderState } from "@/lib/parent-dashboard";

export type ReminderTransitionResult = "noop" | "escalate_call" | "resolve_completed";

export function resolveReminderAction(input: {
  status: ParentReminderState["status"];
  escalateAfter: string | null;
  now: string;
  completed: boolean;
}): ReminderTransitionResult {
  if (input.completed) return "resolve_completed";
  if (input.status === "sent_sms" && input.escalateAfter && new Date(input.now) >= new Date(input.escalateAfter)) {
    return "escalate_call";
  }
  return "noop";
}

export function buildReminderStateFromRow(row: {
  homework_id: string;
  target_date: string;
  status: string;
  escalate_after: string | null;
}): ParentReminderState {
  return {
    homeworkId: row.homework_id,
    targetDate: row.target_date,
    status: row.status as ParentReminderState["status"],
    escalateAfter: row.escalate_after,
  };
}
