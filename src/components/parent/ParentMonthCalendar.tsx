"use client";

import { Button } from "@/components/ui/Button";
import { ParentMonthlyStats } from "@/components/parent/ParentMonthlyStats";
import type { ParentCalendarDay } from "@/lib/parent-dashboard";
import type { ParentMonthlyStats as ParentMonthlyStatsData } from "@/lib/parent-dashboard";

interface ParentMonthCalendarProps {
  days: ParentCalendarDay[];
  selectedDate: string;
  selectedMonth: string;
  monthlyStats?: ParentMonthlyStatsData;
  onSelectDate: (date: string) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function buildLeadingEmptySlots(days: ParentCalendarDay[]) {
  if (days.length === 0) {
    return 0;
  }

  return new Date(`${days[0].date}T00:00:00`).getDay();
}

function formatMonthLabel(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  return `${year}年${monthValue}月`;
}

function getCompletionRatio(day: ParentCalendarDay) {
  if (day.totalCount === 0) {
    return 0;
  }

  return day.completedCount / day.totalCount;
}

function buildProgressRing(day: ParentCalendarDay) {
  const ratio = getCompletionRatio(day);
  const degrees = Math.round(ratio * 360);
  return {
    background: `conic-gradient(rgb(34 197 94) ${degrees}deg, rgb(226 232 240) ${degrees}deg 360deg)`,
  };
}

export function ParentMonthCalendar({
  days,
  selectedDate,
  selectedMonth,
  monthlyStats,
  onSelectDate,
  onPreviousMonth,
  onNextMonth,
}: ParentMonthCalendarProps) {
  const leadingEmptySlots = buildLeadingEmptySlots(days);

  return (
    <section className="space-y-5 rounded-3xl border border-forest-200 bg-white/90 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
            月度视图
          </p>
          <h2 className="mt-2 text-xl font-bold text-forest-800">本月进度日历</h2>
          <p className="text-sm text-forest-500">优先查看今天，再切到全月趋势和重点日期</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onPreviousMonth}>
            上个月
          </Button>
          <div className="rounded-full bg-forest-50 px-4 py-2 text-sm font-semibold text-forest-700">
            {formatMonthLabel(selectedMonth)}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onNextMonth}>
            下个月
          </Button>
          <div className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
            已选 {selectedDate}
          </div>
        </div>
      </div>

      <ParentMonthlyStats stats={monthlyStats} />

      <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-medium text-forest-400">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-2">
            周{label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: leadingEmptySlots }).map((_, index) => (
          <div
            key={`empty-${index}`}
            className="min-h-[88px] rounded-2xl border border-transparent"
          />
        ))}

        {days.map((day) => {
          const isSelected = day.date === selectedDate;
          const completionLabel = day.totalCount === 0 ? "无任务" : `${day.completedCount}/${day.totalCount}`;
          const pendingCount = day.outstandingCount;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate(day.date)}
              className={`min-h-[104px] rounded-3xl border p-3 text-left transition ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-forest-100 bg-white hover:border-forest-300 hover:bg-forest-50"
              }`}
              title={
                day.tooltip
                  ? `布置 ${day.tooltip.assignedCount} 项，完成 ${day.tooltip.completedCount} 项`
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-forest-800">
                  {day.date.slice(-2)}
                </span>
                {day.lateCompletedCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                    补做 {day.lateCompletedCount}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-inner"
                  style={buildProgressRing(day)}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-forest-700">
                    {completionLabel}
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-medium text-forest-500">
                    {day.totalCount === 0 ? "休息日" : "未完成"}
                  </p>
                  <p className="mt-1 text-lg font-bold text-forest-800">
                    {day.totalCount === 0 ? "-" : pendingCount}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs text-forest-400">
                {day.totalCount === 0
                  ? "今天没有安排作业"
                  : day.tooltip?.pendingTitles.slice(0, 2).join("、") || "当天任务已全部完成"}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
