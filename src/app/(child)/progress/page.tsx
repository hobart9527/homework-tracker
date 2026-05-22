"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props["aria-label"]}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        props.disabled
          ? "cursor-not-allowed bg-forest-50 text-forest-300"
          : "bg-cream-50 text-forest-700 shadow-sm ring-1 ring-forest-100 hover:bg-forest-50"
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
    return "bg-cream-100 text-ink-400";
  }

  if (outstandingCount === 0) {
    if (day.lateCount > 0) {
      return "bg-honey-100 text-honey-700";
    }

    return "bg-forest-200 text-forest-800";
  }

  if (day.completedCount > 0) {
    return "bg-forest-100 text-forest-600";
  }

  if (day.date < todayKey) {
    return "bg-coral-100 text-coral-700";
  }

  return "bg-cream-100 text-ink-500";
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
  const router = useRouter();
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
        router.push("/child-login");
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
    <main className="min-h-screen bg-cream-50 p-4 pb-24 text-forest-700 lg:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">

        {/* 成就激励区 — 积分 + 鼓励 */}
        <section className="relative overflow-hidden rounded-card bg-forest-500 p-6 text-white shadow-elevation-floating">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            {/* 核心成就展示 */}
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-white/80">
                {dashboard.summary.monthLabel} {t('child.progress.achievement')}
              </p>
              <h1 className="mt-2 flex items-baseline gap-3 text-3xl font-bold lg:text-4xl">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9 text-honey-400">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span className="text-5xl lg:text-6xl">{dashboard.summary.totalPoints}</span>
                <span className="text-xl text-white/80">积分</span>
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/85">
                {dashboard.summary.completedCount > 0
                  ? `太棒了！你已经完成了 ${dashboard.summary.completedCount} 项任务，继续加油！`
                  : '这个月还没开始打卡哦，快去完成任务吧！'}
              </p>
            </div>
          </div>
        </section>

        {/* Two-column: calendar + insights sidebar */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">

          {/* ═══════════════════════════════════════════════════════════════════
              Left: Calendar — slightly larger than current cramped version
              ═══════════════════════════════════════════════════════════════════ */}
          <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
            {/* 标题栏 */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-forest-800">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 inline-block mr-1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {getMonthLabel(month)} {t('child.weekCalendar.title').replace('本周', '月历')}
                </h2>
                <p className="mt-1 text-sm text-forest-500">
                  {dashboard.summary.completedCount}/{dashboard.summary.totalAssigned} {t('child.progress.completed')} · {dashboard.summary.activeDays} {t('child.progress.activeDays')}
                </p>
              </div>
              {/* 月份切换 */}
              <div className="flex items-center gap-2">
                <MonthSwitchButton
                  label="◀"
                  aria-label="上个月"
                  onClick={() => setMonth(prevMonth)}
                />
                <div className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                  {dashboard.summary.monthLabel}
                </div>
                <MonthSwitchButton
                  label="▶"
                  aria-label="下个月"
                  disabled={disableNextMonth}
                  onClick={() => {
                    if (!disableNextMonth) setMonth(nextMonth);
                  }}
                />
              </div>
            </div>

            {/* 日历网格 */}
            <div className="mt-4">
              {/* 星期标签 */}
              <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-forest-400">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="py-1.5">周{label}</div>
                ))}
              </div>
              {/* 日期格子 */}
              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {Array.from({ length: leadingEmptySlots }).map((_, index) => (
                  <div key={`empty-${index}`} className="min-h-[64px] rounded-2xl border border-transparent" />
                ))}
                {dashboard.calendarDays.map((day) => (
                  <div
                    key={day.date}
                    role="img"
                    aria-label={getHeatmapLabel(day)}
                    className={`min-h-[64px] rounded-2xl border border-forest-100 p-2 ${getCalendarTone(day)}`}
                  >
                    <span className="text-sm font-semibold">{day.date.slice(-2)}</span>
                    {day.totalCount > 0 && (
                      <div className="mt-2 text-center">
                        <div className="text-xs font-bold">{day.completedCount}/{day.totalCount}</div>
                        {day.pointsEarned > 0 && (
                          <div className="text-[10px] opacity-80">+{day.pointsEarned}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════
              Right: Independent insight cards — sticky on desktop
              ═══════════════════════════════════════════════════════════════════ */}
          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start" role="complementary">

            {/* Card 1: 作业类型表现 */}
            {dashboard.weakestTypes.length > 0 || dashboard.strongestTypes.length > 0 ? (
              <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
                <h2 className="text-lg font-bold text-forest-800">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 inline-block mr-1.5">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C6 4 8 6 8 9z" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C18 4 16 6 16 9z" />
                    <path d="M4 22h16" />
                    <path d="M10 22V12a2 2 0 0 1 2-2 2 2 0 0 1 2 2v10" />
                    <path d="M8 9h8v2a4 4 0 0 1-8 0V9z" />
                  </svg>
                  作业类型表现
                </h2>
                <p className="mt-1 text-xs text-forest-500">本月各类型作业的完成情况</p>
                <div className="mt-4 space-y-3">
                  {/* Strongest */}
                  {dashboard.strongestTypes.slice(0, 1).map((item) => (
                    <div key={`strong-${item.typeName}`} className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/80 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 inline-block">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>{" "}
                        {t('child.progress.currentStrength')}
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-lg font-bold text-forest-950">{item.typeName}</div>
                          <div className="text-sm text-forest-700">{item.completedCount}/{item.assignedCount} 完成</div>
                        </div>
                        <div className="text-3xl font-bold text-emerald-600">{formatPercent(item.completionRate)}</div>
                      </div>
                    </div>
                  ))}
                  {/* Weakest */}
                  {dashboard.weakestTypes.slice(0, 1).map((item) => (
                    <div key={`weak-${item.typeName}`} className="rounded-2xl border border-forest-100 bg-forest-50/80 p-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-forest-600">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 inline-block">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>{" "}
                        {t('child.progress.needsImprovement')}
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-base font-bold text-forest-950">{item.typeName}</div>
                          <div className="text-sm text-forest-700">{item.completedCount}/{item.assignedCount} 完成</div>
                        </div>
                        <div className="text-2xl font-bold text-forest-700">{formatPercent(item.completionRate)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Card 2: 学习习惯建议 */}
            {dashboard.habitInsights.length > 0 ? (
              <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
                <h2 className="text-lg font-bold text-forest-800">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 inline-block mr-1.5">
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                  </svg>
                  学习习惯建议
                </h2>
                <p className="mt-1 text-xs text-forest-500">基于本月数据生成的个性化建议</p>
                <div className="mt-4 space-y-2">
                  {dashboard.habitInsights.map((item) => (
                    <div key={item.title} className={`rounded-2xl p-3 ${
                      item.tone === 'good' ? 'bg-emerald-50/80' :
                      item.tone === 'warn' ? 'bg-amber-50/80' :
                      'bg-sky-50/80'
                    }`}>
                      <div className="flex items-center gap-2 text-sm font-semibold text-forest-950">
                        {item.tone === 'good' ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-600">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : item.tone === 'warn' ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-600">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-sky-600">
                            <path d="M9 18h6" />
                            <path d="M10 22h4" />
                            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                          </svg>
                        )}
                        {item.title}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-forest-600">{item.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Card 3: 打卡时段分布 */}
            {dashboard.timeHeatmap.length > 0 ? (
              <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
                <h2 className="text-lg font-bold text-forest-800">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 inline-block mr-1.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  打卡时段分布
                </h2>
                <p className="mt-1 text-xs text-forest-500">颜色越深说明这个时段越常完成作业</p>
                <div className="mt-4">
                  <ParentCheckInHeatmap
                    buckets={dashboard.timeHeatmap}
                    title=""
                    description=""
                  />
                </div>
              </section>
            ) : null}

          </aside>

        </div>
      </div>
    </main>
  );
}
