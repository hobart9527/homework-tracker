"use client";

import type { ParentChildDashboardSummary } from "@/lib/parent-dashboard";

interface ChildSummaryCardProps {
  summary: ParentChildDashboardSummary;
  selected?: boolean;
  onSelect: (id: string) => void;
}

export function ChildSummaryCard({
  summary,
  selected = false,
  onSelect,
}: ChildSummaryCardProps) {
  const progressText = `${summary.completedCount}/${summary.totalCount}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(summary.childId)}
      aria-pressed={selected}
      className={[
        "group w-full rounded-xl border p-4 text-left transition-all duration-200",
        "bg-white shadow-elevation-raised hover:-translate-y-0.5 hover:shadow-elevation-floating",
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-ink-200 hover:border-ink-300",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl",
            selected ? "bg-primary/10" : "bg-forest-50",
          ].join(" ")}
        >
          {summary.avatar || "🦊"}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-forest-800">
                {summary.childName}
              </h3>
              <p className="mt-1 text-sm text-ink-500">
                今日 +{summary.todayPoints} 分
              </p>
            </div>

            <span className="rounded-full bg-forest-50 px-2.5 py-1 text-xs font-medium text-ink-600">
              {progressText}
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-ink-600">
            {summary.topNotice}
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-500">
            {summary.overdueCount > 0 && (
              <span className="rounded-full bg-coral-50 px-2 py-1 text-coral-600">
                逾期 {summary.overdueCount}
              </span>
            )}
            {summary.makeupCount > 0 && (
              <span className="rounded-full bg-honey-50 px-2 py-1 text-honey-600">
                补做 {summary.makeupCount}
              </span>
            )}
            {summary.outstandingCount > 0 && (
              <span className="rounded-full bg-forest-50 px-2 py-1 text-ink-600">
                待完成 {summary.outstandingCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
