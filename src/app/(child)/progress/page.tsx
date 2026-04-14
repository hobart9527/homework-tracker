"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildChildMonthlyProgress,
  getAdjacentMonth,
  isFutureMonth,
} from "@/lib/child-progress";
import { formatDateKey } from "@/lib/homework-utils";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

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

function getCalendarTone(rate: number) {
  if (rate >= 1) {
    return "bg-emerald-500 text-white";
  }

  if (rate >= 0.66) {
    return "bg-emerald-200 text-emerald-900";
  }

  if (rate > 0) {
    return "bg-amber-100 text-amber-900";
  }

  return "bg-white text-forest-700";
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export default function ProgressPage() {
  const supabase = createClient();
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const currentMonth = formatDateKey(new Date()).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);

  useEffect(() => {
    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

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
          .eq("child_id", session.user.id)
          .eq("is_active", true),
        supabase
          .from("check_ins")
          .select("*")
          .eq("child_id", session.user.id)
          .gte("completed_at", start)
          .lte("completed_at", end)
          .order("completed_at", { ascending: true }),
      ]);

      setHomeworks(homeworkResponse.data || []);
      setCheckIns(checkInResponse.data || []);
      setLoading(false);
    };

    fetchData();
  }, [month, supabase]);

  const dashboard = useMemo(
    () =>
      buildChildMonthlyProgress({
        month,
        homeworks,
        checkIns,
      }),
    [checkIns, homeworks, month]
  );
  const nextMonth = getAdjacentMonth(month, 1);
  const prevMonth = getAdjacentMonth(month, -1);
  const disableNextMonth = isFutureMonth(nextMonth, currentMonth);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF] p-4">
        <div className="flex min-h-[70vh] items-center justify-center rounded-[32px] bg-white/85 text-2xl text-forest-700 shadow-lg ring-1 ring-forest-100">
          正在整理这个月的打卡表现...
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
              <h1 className="mt-2 text-3xl font-bold lg:text-4xl">月度打卡分析</h1>
              <p className="mt-3 text-sm leading-6 text-white/85">
                这里不只看打了几次卡，而是帮你看清这个月哪些任务最稳、哪些最容易拖延，以及你通常在什么时间进入学习状态。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-3xl bg-white/14 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">月完成率</div>
                <div className="mt-2 text-2xl font-bold">
                  {formatPercent(dashboard.summary.completionRate)}
                </div>
              </div>
              <div className="rounded-3xl bg-white/14 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">累计积分</div>
                <div className="mt-2 text-2xl font-bold">{dashboard.summary.totalPoints}</div>
              </div>
              <div className="rounded-3xl bg-white/14 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">活跃天数</div>
                <div className="mt-2 text-2xl font-bold">{dashboard.summary.activeDays}</div>
              </div>
              <div className="rounded-3xl bg-white/14 px-4 py-3 backdrop-blur">
                <div className="text-xs text-white/70">按时完成率</div>
                <div className="mt-2 text-2xl font-bold">
                  {formatPercent(dashboard.summary.onTimeRate)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
          <div className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-forest-800">{getMonthLabel(month)}打卡日历</h2>
                <p className="mt-1 text-sm text-forest-500">
                  每一天都显示完成度，补打卡的日期会额外提醒你。
                </p>
              </div>
              <div className="rounded-full bg-forest-50 px-4 py-2 text-sm font-medium text-forest-600">
                {dashboard.summary.completedCount}/{dashboard.summary.totalAssigned} 已完成
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <MonthSwitchButton
                label="上个月"
                onClick={() => {
                  setLoading(true);
                  setMonth(prevMonth);
                }}
              />
              <div className="rounded-full bg-forest-50 px-4 py-2 text-sm font-medium text-forest-700">
                当前查看 {dashboard.summary.monthLabel}
              </div>
              <MonthSwitchButton
                label="下个月"
                disabled={disableNextMonth}
                onClick={() => {
                  if (disableNextMonth) {
                    return;
                  }

                  setLoading(true);
                  setMonth(nextMonth);
                }}
              />
            </div>

            <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-medium text-forest-400">
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
                  className="min-h-[92px] rounded-2xl border border-transparent"
                />
              ))}

              {dashboard.calendarDays.map((day) => (
                <div
                  key={day.date}
                  className={`min-h-[92px] rounded-2xl border border-forest-100 p-3 shadow-sm ${getCalendarTone(
                    day.completionRate
                  )}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{day.date.slice(-2)}</span>
                    {day.lateCount > 0 ? (
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        补 {day.lateCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs opacity-80">
                    {day.totalCount === 0
                      ? "无任务"
                      : `${day.completedCount}/${day.totalCount} 完成`}
                  </p>
                  <p className="mt-1 text-xs opacity-70">+{day.pointsEarned} 积分</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <h2 className="text-xl font-bold text-forest-800">本月分析重点</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-3xl bg-forest-50 p-4">
                  <div className="text-sm text-forest-500">总任务量</div>
                  <div className="mt-2 text-3xl font-bold text-forest-800">
                    {dashboard.summary.totalAssigned}
                  </div>
                </div>
                <div className="rounded-3xl bg-amber-50 p-4">
                  <div className="text-sm text-amber-700">补打卡次数</div>
                  <div className="mt-2 text-3xl font-bold text-amber-800">
                    {dashboard.summary.lateCount}
                  </div>
                </div>
                <div className="rounded-3xl bg-sky-50 p-4">
                  <div className="text-sm text-sky-700">完成任务</div>
                  <div className="mt-2 text-3xl font-bold text-sky-800">
                    {dashboard.summary.completedCount}
                  </div>
                </div>
                <div className="rounded-3xl bg-rose-50 p-4">
                  <div className="text-sm text-rose-700">未完成任务</div>
                  <div className="mt-2 text-3xl font-bold text-rose-800">
                    {dashboard.summary.totalAssigned - dashboard.summary.completedCount}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-forest-800">作业类型表现</h2>
                <span className="text-sm text-forest-500">优先盯住最弱项</span>
              </div>
              <div className="mt-4 space-y-3">
                {dashboard.weakestTypes.slice(0, 2).map((item, index) => (
                  <div
                    key={`weak-${item.typeName}`}
                    className="rounded-3xl border border-amber-100 bg-amber-50/80 p-4"
                  >
                    <div className="text-xs font-medium text-amber-700">
                      #{index + 1} 需要补强
                    </div>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-amber-950">{item.typeName}</div>
                        <div className="text-sm text-amber-800">
                          {item.completedCount}/{item.assignedCount} 完成
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-amber-900">
                        {formatPercent(item.completionRate)}
                      </div>
                    </div>
                  </div>
                ))}
                {dashboard.strongestTypes.slice(0, 1).map((item) => (
                  <div
                    key={`strong-${item.typeName}`}
                    className="rounded-3xl border border-emerald-100 bg-emerald-50/80 p-4"
                  >
                    <div className="text-xs font-medium text-emerald-700">当前优势项</div>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-emerald-950">{item.typeName}</div>
                        <div className="text-sm text-emerald-800">
                          {item.completedCount}/{item.assignedCount} 完成
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-emerald-900">
                        {formatPercent(item.completionRate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-forest-800">打卡时间热力图</h2>
                <p className="mt-1 text-sm text-forest-500">
                  颜色越深，说明这个小时更常完成打卡。
                </p>
              </div>
              <div className="text-sm text-forest-500">共 {checkIns.length} 次记录</div>
            </div>

            <div className="mt-5 grid grid-cols-6 gap-3 sm:grid-cols-8 lg:grid-cols-6 xl:grid-cols-8">
              {dashboard.timeHeatmap.map((bucket) => (
                <div key={bucket.hour} className="space-y-2">
                  <div
                    className="flex aspect-square items-center justify-center rounded-2xl text-sm font-semibold transition"
                    style={{
                      backgroundColor:
                        bucket.count === 0
                          ? "#F4F8F6"
                          : `rgba(34, 139, 109, ${0.15 + bucket.intensity * 0.75})`,
                      color: bucket.count === 0 ? "#7A9A8F" : "#0F3E35",
                    }}
                  >
                    {bucket.count}
                  </div>
                  <div className="text-center text-xs text-forest-500">{bucket.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-forest-100 bg-white/90 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-forest-800">学习习惯建议</h2>
            <div className="mt-4 space-y-3">
              {dashboard.habitInsights.map((item) => (
                <div
                  key={item.title}
                  className={`rounded-3xl p-4 ${
                    item.tone === "warn"
                      ? "bg-amber-50 text-amber-950"
                      : item.tone === "good"
                        ? "bg-emerald-50 text-emerald-950"
                        : "bg-sky-50 text-sky-950"
                  }`}
                >
                  <div className="text-base font-semibold">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 opacity-80">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
