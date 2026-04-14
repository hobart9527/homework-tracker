"use client";

import type { ParentChildDashboardSummary } from "@/lib/parent-dashboard";

interface ParentChildSummaryPanelProps {
  summary: ParentChildDashboardSummary;
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

export function ParentChildSummaryPanel({
  summary,
}: ParentChildSummaryPanelProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-forest-800">
            {summary.childName} 的今日概览
          </h2>
          <p className="text-sm text-forest-500">{summary.topNotice}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
          {summary.avatar || "🦊"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="今日完成率"
          value={`${summary.completedCount}/${summary.totalCount}`}
        />
        <MetricCard label="今日积分" value={summary.todayPoints} />
        <MetricCard label="待完成" value={summary.outstandingCount} />
        <MetricCard label="逾期" value={summary.overdueCount} />
      </div>
    </section>
  );
}
