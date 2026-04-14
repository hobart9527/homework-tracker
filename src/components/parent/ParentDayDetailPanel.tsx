"use client";

import { ParentChildTaskList } from "@/components/parent/ParentChildTaskList";
import type { ParentChildDashboardDetail, ParentReminderState } from "@/lib/parent-dashboard";

interface ParentDayDetailPanelProps {
  detail: ParentChildDashboardDetail;
  selectedDate: string;
  reminderStates?: ParentReminderState[];
  onReminderStateChange?: (homeworkId: string, childId: string, targetDate: string) => void;
}

function formatSelectedDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-forest-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-forest-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-forest-800">{value}</p>
    </div>
  );
}

export function ParentDayDetailPanel({
  detail,
  selectedDate,
  reminderStates,
  onReminderStateChange,
}: ParentDayDetailPanelProps) {
  return (
    <section className="space-y-5 rounded-3xl border border-forest-200 bg-white/90 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-forest-500">
            {formatSelectedDate(selectedDate)}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-forest-800">
            {detail.summary.childName} 的当天进展
          </h2>
          <p className="mt-1 text-sm text-forest-500">{detail.summary.topNotice}</p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
          {detail.summary.avatar || "🦊"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="当天完成率"
          value={`${detail.summary.completedCount}/${detail.summary.totalCount}`}
        />
        <MetricCard label="当天积分" value={detail.summary.todayPoints} />
        <MetricCard label="待完成" value={detail.summary.outstandingCount} />
        <MetricCard label="逾期" value={detail.summary.overdueCount} />
      </div>

      <ParentChildTaskList
        tasks={detail.tasks}
        childId={detail.summary.childId}
        selectedDate={selectedDate}
        reminderStates={reminderStates}
        onReminderStateChange={onReminderStateChange}
      />
    </section>
  );
}
