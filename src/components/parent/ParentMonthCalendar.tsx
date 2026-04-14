"use client";

import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/hooks/useTranslation";
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
      bgClass: "bg-slate-50",
      textClass: "text-slate-400",
      dotClass: "bg-slate-300",
    };
  }

  if (day.outstandingCount === 0) {
    if (day.lateCompletedCount > 0) {
      return {
        label: "补做完成",
        ringColor: "rgb(245 158 11)",
        bgClass: "bg-amber-50",
        textClass: "text-amber-700",
        dotClass: "bg-amber-400",
      };
    }

    return {
      label: "已完成",
      ringColor: "rgb(34 197 94)",
      bgClass: "bg-emerald-50",
      textClass: "text-emerald-700",
      dotClass: "bg-emerald-500",
    };
  }

  if (day.completedCount > 0) {
    return {
      label: "进行中",
      ringColor: "rgb(59 130 246)",
      bgClass: "bg-sky-50",
      textClass: "text-sky-700",
      dotClass: "bg-sky-500",
    };
  }

  if (day.date < todayKey) {
    return {
      label: "未完成",
      ringColor: "rgb(244 63 94)",
      bgClass: "bg-rose-50",
      textClass: "text-rose-700",
      dotClass: "bg-rose-500",
    };
  }

  return {
    label: "未开始",
    ringColor: "rgb(107 114 128)",
    bgClass: "bg-slate-50",
    textClass: "text-slate-500",
    dotClass: "bg-slate-400",
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
    <div className="rounded-xl bg-forest-50/80 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-forest-400">
        {label}
      </p>
      <p className="mt-0.5 text-base font-bold text-forest-800">{value}</p>
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
  const { t } = useTranslation();
  const leadingEmptySlots = buildLeadingEmptySlots(days);
  const safeStats = monthlyStats ?? {
    completionRate: 0,
    onTimeRate: 0,
    totalPoints: 0,
    incompleteCount: 0,
  };
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-4 rounded-2xl border border-forest-100 bg-white/95 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
            {t('parent.monthCalendar.sectionLabel')}
          </p>
          <h2 className="mt-1 text-lg font-bold text-forest-800">{t('parent.monthCalendar.title')}</h2>
        </div>

        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onPreviousMonth}>
            {t('parent.monthCalendar.previousMonth')}
          </Button>
          <div className="rounded-lg bg-forest-50 px-3 py-1.5 text-xs font-semibold text-forest-700">
            {formatMonthLabel(selectedMonth)}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onNextMonth}>
            {t('parent.monthCalendar.nextMonth')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatChip label="完成率" value={formatPercent(safeStats.completionRate)} />
        <StatChip label="准时率" value={formatPercent(safeStats.onTimeRate)} />
        <StatChip label="累计积分" value={safeStats.totalPoints} />
        <StatChip label="未完成数" value={safeStats.incompleteCount} />
      </div>

      {/* Calendar Grid */}
      <div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-forest-400">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1">
              周{label}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: leadingEmptySlots }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="h-12 rounded-lg"
            />
          ))}

          {days.map((day) => {
            const isSelected = day.date === selectedDate;
            const isToday = day.date === todayKey;
            const tone = getDayTone(day);

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onSelectDate(day.date)}
                aria-pressed={isSelected}
                aria-label={getDayAriaLabel(day)}
                className={`relative flex h-12 flex-col items-center justify-center rounded-lg transition-all ${tone.bgClass} ${
                  isSelected
                    ? "ring-2 ring-primary ring-offset-1"
                    : "hover:ring-1 hover:ring-forest-200"
                }`}
                title={
                  day.tooltip
                    ? `${day.tooltip.assignedCount}项 / 完成${day.tooltip.completedCount}项`
                    : undefined
                }
              >
                {/* Top row: date number + indicators */}
                <div className="flex items-center gap-0.5">
                  <span className={`text-xs font-semibold ${tone.textClass}`}>
                    {day.date.slice(-2)}
                  </span>
                  {isToday && (
                    <span className="rounded bg-primary/20 px-1 py-0.5 text-[8px] font-medium text-primary">
                      今
                    </span>
                  )}
                  {day.lateCompletedCount > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </div>

                {/* Progress dot */}
                <div
                  className="mt-0.5 h-2 w-2 rounded-full"
                  style={{ backgroundColor: tone.dotClass }}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-forest-50 pt-2 text-[10px] text-forest-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> 已完成
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> 进行中
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-slate-400" /> 未开始
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> 未完成
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> 补做
        </span>
      </div>
    </section>
  );
}
