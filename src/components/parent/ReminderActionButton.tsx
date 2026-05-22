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
        已短信提醒 · 45分钟后电话
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 mr-1">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>提醒
    </Button>
  );
}