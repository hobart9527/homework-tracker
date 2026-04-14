"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ParentCheckInHeatmap } from "@/components/parent/ParentCheckInHeatmap";
import {
  buildChildMonthlyProgress,
  getAdjacentMonth,
  isFutureMonth,
} from "@/lib/child-progress";
import { formatDateKey } from "@/lib/homework-utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

function getHistoricalHomeworksForMonth(
  homeworks: Homework[],
  month: string,
  currentMonth: string
) {
  if (month < currentMonth) {
    return homeworks.map((homework) => ({
      ...homework,
      is_active: true,
    })) as Homework[];
  }

  return homeworks;
}

function getMonthBounds(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(year, monthIndex, 0);
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getMonthLabel(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return `${year}年${monthIndex}月`;
}

function MonthSwitchButton(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        props.disabled
          ? "cursor-not-allowed bg-forest-50 text-forest-300"
          : "bg-white text-forest-700 shadow-sm ring-1 ring-forest-100 hover:bg-forest-50"
      }`}
    >
      {props.label}
    </button>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getCalendarTone(day: {
  date: string;
  totalCount: number;
  completedCount: number;
  lateCount: number;
  completionRate: number;
}) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;
  const outstandingCount = day.totalCount - day.completedCount;

  if (day.totalCount === 0) {
    return "bg-slate-100 text-slate-500";
  }

  if (outstandingCount === 0) {
    if (day.lateCount > 0) {
      return "bg-amber-100 text-amber-700";
    }

    return "bg-emerald-500 text-white";
  }

  if (day.completedCount > 0) {
    return "bg-sky-100 text-sky-700";
  }

  if (day.date < todayKey) {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-slate-100 text-slate-600";
}

function getHeatmapLabel(day: { date: string; totalCount: number; completedCount: number }) {
  if (day.totalCount === 0) {
    return `${day.date} 无任务`;
  }

  return `${day.date} 完成 ${day.completedCount}/${day.totalCount}`;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export default function ProgressPage() {
  const { t } = useTranslation();
  const [supabase] = useState(() => createClient());
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentMonth = formatDateKey(new Date()).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!session) {
        setHomeworks([]);
        setCheckIns([]);
        setLoading(false);
        return;
      }

      const { start, end } = getMonthBounds(month);

      const [homeworkResponse, checkInResponse] = await Promise.all([
        supabase
          .from("homeworks")
          .select("*")
          .eq("child_id", session.user.id),
        supabase
          .from("check_ins")
          .select("*")
          .eq("child_id", session.user.id)
          .gte("completed_at", start)
          .lte("completed_at", end)
          .order("completed_at", { ascending: true }),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setHomeworks(homeworkResponse.data || []);
      setCheckIns(checkInResponse.data || []);
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setHomeworks([]);
      setCheckIns([]);
      setError(fetchError instanceof Error ? fetchError.message : "加载失败");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [month, supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const dashboard = useMemo(
    () =>
      buildChildMonthlyProgress({
        month,
        homeworks: getHistoricalHomeworksForMonth(homeworks, month, currentMonth),
        checkIns,
      }),
    [checkIns, currentMonth, homeworks, month]
  );
  const nextMonth = getAdjacentMonth(month, 1);
  const prevMonth = getAdjacentMonth(month, -1);
  const disableNextMonth = isFutureMonth(nextMonth, currentMonth);
  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4">
        <div
          role="alert"
          className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center rounded-[32px] bg-white/90 p-6 text-center text-forest-700 shadow-lg ring-1 ring-forest-100"
        >
          <div>
            <div className="text-2xl font-bold">{t('child.progress.loadError')}</div>
            <p className="mt-2 text-sm text-forest-500">{error}</p>
            <button
              type="button"
              onClick={() => {
                void fetchData();
              }}
              className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4">
        <div className="flex min-h-[70vh] items-center justify-center rounded-[32px] bg-white/85 text-2xl text-forest-700 shadow-lg ring-1 ring-forest-100">
          {t('child.progress.loadingMessage')}
        </div>
      </main>
    );
  }

  const leadingEmptySlots =
    dashboard.calendarDays.length === 0
      ? 0
      : new Date(`${dashboard.calendarDays[0].date}T00:00:00`).getDay();

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4 pb-24 text-forest-700 lg:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#155E52_0%,#2C7C68_48%,#F6B06A_100%)] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-white/80">{dashboard.summary.monthLabel}</p>
              <h1 className="mt-2 text-3xl font-bold lg:text-4xl">{t('child.progress.monthlyTitle')}</h1>
              <p className="mt-3 text-sm leading-6 text-white/85">
                {t('child.progress.monthlyDescription')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-3xl bg-white/14 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">{t('child.progress.monthCompletionRate')}</div>
                <div className="mt-2 text-2xl font-bold">
                  {formatPercent(dashboard.summary.completionRate)}
                </div>
              </div>
              <div className="rounded-3xl bg-white/14 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">{t('child.progress.totalPoints')}</div>
                <div className="mt-2 text-2xl font-bold">{dashboard.summary.totalPoints}</div>
              </div>
              <div className="rounded-3xl bg-white/14 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">{t('child.progress.activeDays')}</div>
                <div className="mt-2 text-2xl font-bold">{dashboard.summary.activeDays}</div>
              </div>
              <div className="rounded-3xl bg-white/14 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">{t('child.progress.onTimeRate')}</div>
                <div className="mt-2 text-2xl font-bold">
                  {formatPercent(dashboard.summary.onTimeRate)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_22rem] xl:items-start">
          <div className="space-y-5">
            <div className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-forest-800">{getMonthLabel(month)}{t('child.weekCalendar.title')}</h2>
                  <p className="mt-1 text-sm text-forest-500">
                    {t('child.progress.monthlyDescription')}
                  </p>
                </div>
                <div className="rounded-full bg-forest-50 px-4 py-2 text-sm font-medium text-forest-600">
                  {dashboard.summary.completedCount}/{dashboard.summary.totalAssigned} {t('child.progress.completed')}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <MonthSwitchButton
                  label={t('parent.monthCalendar.previousMonth')}
                  onClick={() => {
                    setMonth(prevMonth);
                  }}
                />
                <div className="rounded-full bg-forest-50 px-4 py-2 text-sm font-medium text-forest-700">
                  {t('child.progress.currentlyViewing')} {dashboard.summary.monthLabel}
                </div>
                <MonthSwitchButton
                  label={t('parent.monthCalendar.nextMonth')}
                  disabled={disableNextMonth}
                  onClick={() => {
                    if (disableNextMonth) {
                      return;
                    }

                    setMonth(nextMonth);
                  }}
                />
              </div>

              <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-medium text-forest-400">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="py-2">
                    {t('child.weekCalendar.title').replace('本周', '')}{label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: leadingEmptySlots }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    className="min-h-[92px] rounded-2xl border border-transparent"
                  />
                ))}

                {dashboard.calendarDays.map((day) => (
                  <div
                    key={day.date}
                    role="img"
                    aria-label={getHeatmapLabel(day)}
                    className={`min-h-[92px] rounded-2xl border border-forest-100 p-3 shadow-sm ${getCalendarTone(
                      day
                    )}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold">{day.date.slice(-2)}</span>
                      {day.lateCount > 0 ? (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-forest-700">
                          {t('child.progress.late')} {day.lateCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xs opacity-80">
                      {day.totalCount === 0
                        ? t('child.progress.noTask')
                        : `${day.completedCount}/${day.totalCount} ${t('child.progress.completed')}`}
                    </p>
                    <p className="mt-1 text-xs opacity-70">+{day.pointsEarned} {t('child.progress.pointsEarned')}</p>
                  </div>
                ))}
              </div>
            </div>

            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <ParentCheckInHeatmap
                buckets={dashboard.timeHeatmap}
                title={t('child.progress.checkInPeakTime')}
                description={t('child.progress.peakTimeDescription')}
              />
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start" role="complementary">
            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <h2 className="text-xl font-bold text-forest-800">{t('child.progress.monthlyAnalysisFocus')}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-3xl bg-forest-50 p-4">
                  <div className="text-sm text-forest-500">{t('child.progress.totalAssigned')}</div>
                  <div className="mt-2 text-3xl font-bold text-forest-800">
                    {dashboard.summary.totalAssigned}
                  </div>
                </div>
                <div className="rounded-3xl bg-forest-50 p-4">
                  <div className="text-sm text-forest-500">{t('child.progress.lateCheckInCount')}</div>
                  <div className="mt-2 text-3xl font-bold text-forest-800">
                    {dashboard.summary.lateCount}
                  </div>
                </div>
                <div className="rounded-3xl bg-forest-50 p-4">
                  <div className="text-sm text-forest-500">{t('child.progress.completedTasks')}</div>
                  <div className="mt-2 text-3xl font-bold text-forest-800">
                    {dashboard.summary.completedCount}
                  </div>
                </div>
                <div className="rounded-3xl bg-forest-50 p-4">
                  <div className="text-sm text-forest-500">{t('child.progress.incompleteTasks')}</div>
                  <div className="mt-2 text-3xl font-bold text-forest-800">
                    {dashboard.summary.totalAssigned - dashboard.summary.completedCount}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-forest-800">{t('child.progress.homeworkTypePerformance')}</h2>
                <span className="text-sm text-forest-500">{t('child.progress.focusOnWeakest')}</span>
              </div>
              <div className="mt-4 space-y-3">
                {dashboard.weakestTypes.slice(0, 2).map((item, index) => (
                  <div
                    key={`weak-${item.typeName}`}
                    className="rounded-3xl border border-forest-100 bg-forest-50/80 p-4"
                  >
                    <div className="text-xs font-medium text-forest-600">
                      #{index + 1} {t('child.progress.needsImprovement')}
                    </div>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-forest-950">{item.typeName}</div>
                        <div className="text-sm text-forest-700">
                          {item.completedCount}/{item.assignedCount} {t('child.progress.completed')}
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-forest-900">
                        {formatPercent(item.completionRate)}
                      </div>
                    </div>
                  </div>
                ))}
                {dashboard.strongestTypes.slice(0, 1).map((item) => (
                  <div
                    key={`strong-${item.typeName}`}
                    className="rounded-3xl border border-forest-100 bg-forest-50/80 p-4"
                  >
                    <div className="text-xs font-medium text-forest-600">{t('child.progress.currentStrength')}</div>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-forest-950">{item.typeName}</div>
                        <div className="text-sm text-forest-700">
                          {item.completedCount}/{item.assignedCount} {t('child.progress.completed')}
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-forest-900">
                        {formatPercent(item.completionRate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <h2 className="text-xl font-bold text-forest-800">{t('child.progress.learningHabitSuggestions')}</h2>
              <div className="mt-4 space-y-3">
                {dashboard.habitInsights.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-3xl bg-forest-50 p-4 text-forest-950"
                  >
                    <div className="text-base font-semibold">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 opacity-80">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
