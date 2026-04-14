"use client";

import { Button } from "@/components/ui/Button";
import type { ParentReminderState } from "@/lib/parent-dashboard";

interface ReminderActionButtonProps {
  homeworkId: string;
  childId: string;
  targetDate: string;
  state?: ParentReminderState | null;
  onRemind?: (homeworkId: string, childId: string, targetDate: string) => void;
}

export function ReminderActionButton({
  homeworkId,
  childId,
  targetDate,
  state,
  onRemind,
}: ReminderActionButtonProps) {
  if (state?.status === "escalated_call") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 whitespace-nowrap">
        已电话提醒
      </span>
    );
  }

  if (state?.status === "sent_sms") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 whitespace-nowrap">
        已短信提醒 · 45分钟后未完成将电话提醒
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => onRemind?.(homeworkId, childId, targetDate)}
      className="whitespace-nowrap text-xs h-7 px-2"
    >
      🔔 提醒
    </Button>
  );
}