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
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
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
    <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4 pb-24 text-forest-700 lg:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">

        {/* ═══════════════════════════════════════════════════════════════════
            第1区：成就激励区 - 孩子最关心的：积分、连续天数、完成数
            ═══════════════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#155E52_0%,#2C7C68_48%,#F6B06A_100%)] p-6 text-white shadow-xl">
          {/* 装饰圆形 */}
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-5 -right-5 h-24 w-24 rounded-full bg-white/5" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            {/* 左侧：核心成就展示 */}
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-white/80">
                {dashboard.summary.monthLabel} {t('child.progress.achievement')}
              </p>
              <h1 className="mt-2 flex items-baseline gap-3 text-3xl font-bold lg:text-4xl">
                <span>⭐</span>
                <span className="text-5xl lg:text-6xl">{dashboard.summary.totalPoints}</span>
                <span className="text-xl text-white/80">积分</span>
              </h1>
              <p className="mt-3 text-sm leading-6 text-white/85">
                {dashboard.summary.completedCount > 0
                  ? `太棒了！你已经完成了 ${dashboard.summary.completedCount} 项任务，继续加油！`
                  : '这个月还没开始打卡哦，快去完成任务吧！'}
              </p>
            </div>

            {/* 右侧：关键数据卡片 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {/* 完成率 */}
              <div className="rounded-3xl bg-white/15 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">{t('child.progress.monthCompletionRate')}</div>
                <div className="mt-1 text-2xl font-bold">
                  {formatPercent(dashboard.summary.completionRate)}
                </div>
              </div>
              {/* 活跃天数 */}
              <div className="rounded-3xl bg-white/15 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">{t('child.progress.activeDays')}</div>
                <div className="mt-1 flex items-baseline gap-1 text-2xl font-bold">
                  {dashboard.summary.activeDays}
                  <span className="text-sm text-white/70">天</span>
                </div>
              </div>
              {/* 准时率 */}
              <div className="rounded-3xl bg-white/15 px-4 py-3 backdrop-blur sm:col-span-1">
                <div className="text-xs text-white/70">{t('child.progress.onTimeRate')}</div>
                <div className="mt-1 text-2xl font-bold">
                  {formatPercent(dashboard.summary.onTimeRate)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            第2区：月度日历 - 视觉化进度展示
            ═══════════════════════════════════════════════════════════════════ */}
        <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
          {/* 标题栏 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-forest-800">
                📅 {getMonthLabel(month)} {t('child.weekCalendar.title').replace('本周', '月历')}
              </h2>
              <p className="mt-1 text-sm text-forest-500">
                {dashboard.summary.completedCount}/{dashboard.summary.totalAssigned} {t('child.progress.completed')} · {dashboard.summary.activeDays} {t('child.progress.activeDays')}
              </p>
            </div>
            {/* 月份切换 */}
            <div className="flex items-center gap-2">
              <MonthSwitchButton
                label="◀"
                onClick={() => setMonth(prevMonth)}
              />
              <div className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                {dashboard.summary.monthLabel}
              </div>
              <MonthSwitchButton
                label="▶"
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
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-forest-400">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="py-2">周{label}</div>
              ))}
            </div>
            {/* 日期格子 */}
            <div className="mt-2 grid grid-cols-7 gap-2">
              {Array.from({ length: leadingEmptySlots }).map((_, index) => (
                <div key={`empty-${index}`} className="min-h-[80px] rounded-2xl border border-transparent" />
              ))}
              {dashboard.calendarDays.map((day) => (
                <div
                  key={day.date}
                  role="img"
                  aria-label={getHeatmapLabel(day)}
                  className={`min-h-[80px] rounded-2xl border border-forest-100 p-2 shadow-sm ${getCalendarTone(day)}`}
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
            第3区：侧边栏 - 成就与建议（粘性布局）
            ═══════════════════════════════════════════════════════════════════ */}
        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start" role="complementary">

          {/* 作业类型表现 - 正向激励 */}
          {dashboard.weakestTypes.length > 0 || dashboard.strongestTypes.length > 0 ? (
            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <h2 className="text-lg font-bold text-forest-800">🏆 {t('child.progress.homeworkTypePerformance')}</h2>

              {/* 最强项 - 优先展示 */}
              {dashboard.strongestTypes.slice(0, 1).map((item) => (
                <div
                  key={`strong-${item.typeName}`}
                  className="mt-4 rounded-3xl border-2 border-emerald-200 bg-emerald-50/80 p-4"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                    <span>🌟</span> {t('child.progress.currentStrength')}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-forest-950">{item.typeName}</div>
                      <div className="text-sm text-forest-700">
                        {item.completedCount}/{item.assignedCount} 完成
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-emerald-600">
                      {formatPercent(item.completionRate)}
                    </div>
                  </div>
                </div>
              ))}

              {/* 需加强项 - 简化展示 */}
              {dashboard.weakestTypes.slice(0, 1).map((item, index) => (
                <div
                  key={`weak-${item.typeName}`}
                  className="mt-3 rounded-3xl border border-forest-100 bg-forest-50/80 p-4"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-forest-600">
                    <span>📚</span> {t('child.progress.needsImprovement')}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-forest-950">{item.typeName}</div>
                      <div className="text-sm text-forest-700">
                        {item.completedCount}/{item.assignedCount} 完成
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-forest-700">
                      {formatPercent(item.completionRate)}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {/* 学习习惯建议 - 简洁展示 */}
          {dashboard.habitInsights.length > 0 ? (
            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <h2 className="text-lg font-bold text-forest-800">💡 {t('child.progress.learningHabitSuggestions')}</h2>
              <div className="mt-3 space-y-2">
                {dashboard.habitInsights.slice(0, 2).map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl bg-forest-50/80 p-3 text-forest-950"
                  >
                    <div className="text-sm font-semibold">{item.title}</div>
                    <p className="mt-1 text-xs leading-5 text-forest-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 打卡时段分布 - 折叠展示 */}
          {dashboard.timeHeatmap.length > 0 ? (
            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <h2 className="text-lg font-bold text-forest-800">⏰ {t('child.progress.checkInPeakTime')}</h2>
              <div className="mt-3">
                <ParentCheckInHeatmap
                  buckets={dashboard.timeHeatmap}
                  description=""
                />
              </div>
            </section>
          ) : null}

        </aside>
      </div>
    </main>
  );
}
