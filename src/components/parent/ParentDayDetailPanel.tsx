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

function formatPercent(completedCount: number, totalCount: number) {
  if (totalCount === 0) {
    return "0%";
  }

  return `${Math.round((completedCount / totalCount) * 100)}%`;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-radius-lg border border-ink-200 bg-white p-space-4 shadow-elevation-raised">
      <p className="text-ui-xs font-medium uppercase tracking-[0.2em] text-ink-400">
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
    <section className="space-y-5 rounded-radius-xl border border-ink-200 bg-white p-space-5 shadow-elevation-raised">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-ui-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
              当天任务
            </p>
            <h2 className="mt-2 text-3xl font-bold text-forest-800">
              {detail.summary.childName} 在这一天的安排
            </h2>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-radius-xl bg-primary/10 text-3xl">
              {detail.summary.avatar || "🦊"}
            </div>
            <div>
              <p className="text-ui-sm font-medium text-ink-500">
                {formatSelectedDate(selectedDate)}
              </p>
              <p className="mt-1 text-ui-base text-ink-600">{detail.summary.topNotice}</p>
            </div>
          </div>
        </div>

        <div className="rounded-radius-xl border border-ink-200 bg-forest-50 px-space-5 py-4 text-right">
          <p className="text-ui-xs font-medium uppercase tracking-[0.18em] text-ink-400">
            今日完成率
          </p>
          <p className="mt-2 text-4xl font-bold text-forest-800">
            {formatPercent(detail.summary.completedCount, detail.summary.totalCount)}
          </p>
          <p className="mt-1 text-ui-sm text-ink-500">
            {detail.summary.completedCount}/{detail.summary.totalCount} 项完成
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="当天任务" value={detail.summary.totalCount} />
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
