"use client";

import { Button } from "@/components/ui/Button";
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
  const color = getDayTone(day).ringColor;
  return {
    background: `conic-gradient(${color} ${degrees}deg, rgb(226 232 240) ${degrees}deg 360deg)`,
  };
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getDayTone(day: ParentCalendarDay) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;

  if (day.totalCount === 0) {
    return {
      label: "无任务",
      ringColor: "rgb(148 163 184)",
      chipClass: "bg-slate-100 text-slate-500",
    };
  }

  if (day.outstandingCount === 0) {
    if (day.lateCompletedCount > 0) {
      return {
        label: "补做完成",
        ringColor: "rgb(245 158 11)",
        chipClass: "bg-amber-100 text-amber-700",
      };
    }

    return {
      label: "已完成",
      ringColor: "rgb(34 197 94)",
      chipClass: "bg-emerald-100 text-emerald-700",
    };
  }

  if (day.completedCount > 0) {
    return {
      label: "进行中",
      ringColor: "rgb(59 130 246)",
      chipClass: "bg-sky-100 text-sky-700",
    };
  }

  if (day.date < todayKey) {
    return {
      label: "未完成",
      ringColor: "rgb(244 63 94)",
      chipClass: "bg-rose-100 text-rose-700",
    };
  }

  return {
    label: "未开始",
    ringColor: "rgb(107 114 128)",
    chipClass: "bg-slate-100 text-slate-600",
  };
}

function getDayAriaLabel(day: ParentCalendarDay) {
  const tone = getDayTone(day);

  if (day.totalCount === 0) {
    return `${day.date} 无任务`;
  }

  return `${day.date} ${tone.label}，完成 ${day.completedCount}/${day.totalCount}`;
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-forest-100 bg-white/80 px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-forest-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-forest-800">{value}</p>
    </div>
  );
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
  const safeStats = monthlyStats ?? {
    completionRate: 0,
    onTimeRate: 0,
    totalPoints: 0,
    incompleteCount: 0,
  };

  return (
    <section className="space-y-5 rounded-3xl border border-forest-200 bg-white/90 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
            月度视图
          </p>
          <h2 className="mt-2 text-xl font-bold text-forest-800">本月进度日历</h2>
          <p className="text-sm text-forest-500">点日期查看当天任务，用圆环颜色快速判断每天的完成状态</p>
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
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatChip label="完成率" value={formatPercent(safeStats.completionRate)} />
          <StatChip label="准时率" value={formatPercent(safeStats.onTimeRate)} />
          <StatChip label="累计积分" value={safeStats.totalPoints} />
          <StatChip label="未完成数" value={safeStats.incompleteCount} />
        </div>

        <div>
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-medium text-forest-400">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1">
                周{label}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {Array.from({ length: leadingEmptySlots }).map((_, index) => (
              <div
                key={`empty-${index}`}
                className="min-h-[72px] rounded-2xl border border-transparent"
              />
            ))}

            {days.map((day) => {
              const isSelected = day.date === selectedDate;
              const tone = getDayTone(day);
              const todayKey = new Date().toISOString().slice(0, 10);
              const isToday = day.date === todayKey;

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onSelectDate(day.date)}
                  aria-pressed={isSelected}
                  aria-label={getDayAriaLabel(day)}
                  className={`relative flex min-h-[96px] flex-col items-center justify-center rounded-2xl border p-3 transition ${
                    isSelected
                      ? "border-forest-200 bg-white shadow-sm"
                      : "border-forest-100 bg-white hover:border-forest-300 hover:bg-forest-50"
                  }`}
                  title={
                    day.tooltip
                      ? `布置 ${day.tooltip.assignedCount} 项，完成 ${day.tooltip.completedCount} 项`
                      : undefined
                  }
                >
                  <div className="sr-only">{day.date.slice(-2)}</div>

                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    {isToday ? (
                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        今
                      </span>
                    ) : null}
                    {day.lateCompletedCount > 0 ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700">
                        补
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-inner ${
                      isSelected ? "ring-1 ring-primary/20" : ""
                    }`}
                    style={buildProgressRing(day)}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-semibold text-forest-700">
                      {day.date.slice(-2)}
                    </div>
                  </div>

                  {isSelected ? (
                    <span className="absolute bottom-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-forest-100 pt-3 text-xs text-forest-500">
          {[
            { label: "已完成", className: "bg-emerald-100 text-emerald-700" },
            { label: "进行中", className: "bg-sky-100 text-sky-700" },
            { label: "未开始", className: "bg-slate-100 text-slate-600" },
            { label: "未完成", className: "bg-rose-100 text-rose-700" },
            { label: "补做完成", className: "bg-amber-100 text-amber-700" },
          ].map((item) => (
            <span key={item.label} className={`rounded-full px-2.5 py-1 ${item.className}`}>
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
