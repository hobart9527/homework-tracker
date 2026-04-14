"use client";

import { ParentDayDetailPanel } from "@/components/parent/ParentDayDetailPanel";
import type { ParentChildDashboardDetail, ParentReminderState } from "@/lib/parent-dashboard";

interface TodayOverviewProps {
  detail: ParentChildDashboardDetail;
  selectedDate: string;
  reminderStates?: ParentReminderState[];
  onReminderStateChange?: (homeworkId: string, childId: string, targetDate: string) => void;
}

export function TodayOverview({
  detail,
  selectedDate,
  reminderStates,
  onReminderStateChange,
}: TodayOverviewProps) {
  return (
    <ParentDayDetailPanel
      detail={detail}
      selectedDate={selectedDate}
      reminderStates={reminderStates}
      onReminderStateChange={onReminderStateChange}
    />
  );
}
