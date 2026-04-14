"use client";

import type { ParentCalendarDay } from "@/lib/parent-dashboard";

interface ParentMonthCalendarProps {
  days: ParentCalendarDay[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function buildLeadingEmptySlots(days: ParentCalendarDay[]) {
  if (days.length === 0) {
    return 0;
  }

  return new Date(`${days[0].date}T00:00:00`).getDay();
}

export function ParentMonthCalendar({
  days,
  selectedDate,
  onSelectDate,
}: ParentMonthCalendarProps) {
  const leadingEmptySlots = buildLeadingEmptySlots(days);

  return (
    <section className="rounded-3xl border border-forest-200 bg-white/90 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-forest-800">本月打卡日历</h2>
          <p className="text-sm text-forest-500">点击任意一天查看孩子当天的完成情况</p>
        </div>
        <div className="rounded-full bg-forest-50 px-3 py-1 text-sm text-forest-600">
          已选 {selectedDate}
        </div>
      </div>

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
          const completionLabel =
            day.totalCount === 0
              ? "无任务"
              : `${day.completedCount}/${day.totalCount} 完成`;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate(day.date)}
              className={`min-h-[88px] rounded-2xl border p-3 text-left transition ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-forest-100 bg-white hover:border-forest-300 hover:bg-forest-50"
              }`}
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
              <p className="mt-3 text-xs text-forest-500">{completionLabel}</p>
              <p className="mt-1 text-xs text-forest-400">
                未完成 {day.outstandingCount}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
