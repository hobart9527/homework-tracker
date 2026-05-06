"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDateKey } from "@/lib/homework-utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";
import { Button } from "@/components/ui/Button";
import { ChildSelector } from "@/components/parent/ChildSelector";
import { ParentCheckInHeatmap } from "@/components/parent/ParentCheckInHeatmap";
import { ParentMonthCalendar } from "@/components/parent/ParentMonthCalendar";
import { ParentMonthlyInsights } from "@/components/parent/ParentMonthlyInsights";
import { ReadingProgressPanel } from "@/components/reading/ReadingProgressPanel";
import { TodayOverview } from "@/components/parent/TodayOverview";
import {
  buildParentDashboard,
  getDefaultSelectedChildId,
  type ParentMonthlyDashboard,
  type ParentReminderState,
} from "@/lib/parent-dashboard";

type Child = Database["public"]["Tables"]["children"]["Row"];
type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

function shiftMonth(month: string, offset: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const next = new Date(year, monthIndex - 1 + offset, 1);
  const nextYear = next.getFullYear();
  const nextMonth = `${next.getMonth() + 1}`.padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

function getFirstDayOfMonth(month: string) {
  return `${month}-01`;
}

const EMPTY_DASHBOARD: ParentMonthlyDashboard = {
  summaries: [],
  calendarDays: [],
  selectedDayDetails: [],
  weakestTypes: [],
  monthlyStats: {
    completionRate: 0,
    onTimeRate: 0,
    totalPoints: 0,
    incompleteCount: 0,
  },
  checkInHeatmap: [],
};

export default function ParentDashboardPage() {
  const { t } = useTranslation();
  const [supabase] = useState(() => createClient());
  const [dashboard, setDashboard] =
    useState<ParentMonthlyDashboard>(EMPTY_DASHBOARD);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() =>
    formatDateKey(new Date()).slice(0, 7)
  );
  const [loading, setLoading] = useState(true);
  const [reminderStates, setReminderStates] = useState<ParentReminderState[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  // Store raw data in ref to avoid re-fetching when child selection changes
  const rawDataRef = useRef<{
    children: Child[];
    homeworks: Homework[];
    checkIns: CheckIn[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchDashboard = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (!cancelled) {
            setDashboard(EMPTY_DASHBOARD);
          }
          return;
        }

        const { data: childrenData } = await supabase
          .from("children")
          .select("*")
          .eq("parent_id", session.user.id);

        const children = (childrenData ?? []) as Child[];

        if (children.length === 0) {
          if (!cancelled) {
            setDashboard(EMPTY_DASHBOARD);
            setSelectedChildId(null);
          }
          return;
        }

        const childIds = children.map((child) => child.id);

        let homeworksData: Homework[] = [];
        let checkInsData: CheckIn[] = [];

        try {
          const results = await Promise.all([
            supabase
              .from("homeworks")
              .select("*")
              .eq("created_by", session.user.id),
            supabase
              .from("check_ins")
              .select("*")
              .in("child_id", childIds),
          ]);
          homeworksData = (results[0].data ?? []) as Homework[];
          checkInsData = (results[1].data ?? []) as CheckIn[];
        } catch (err) {
          console.error("Failed to fetch homeworks or check-ins:", err);
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        // Store raw data for child selection changes
        rawDataRef.current = { children, homeworks: homeworksData, checkIns: checkInsData };

        const nextDashboard = buildParentDashboard({
          children,
          homeworks: homeworksData,
          checkIns: checkInsData,
          date: selectedDate,
          month: selectedMonth,
        });

        if (cancelled) {
          return;
        }

        setDashboard(nextDashboard);
        setSelectedChildId((current) =>
          current ?? getDefaultSelectedChildId(nextDashboard.summaries)
        );

        // Fetch reminders after dashboard is updated, to avoid race condition
        const month = selectedDate.substring(0, 7);
        await fetchReminders(session.user.id, month);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDashboard();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedMonth, supabase, refreshTick]);

  // Auto-refresh when child checks in (via child-points-changed event or realtime)
  useEffect(() => {
    const handleRefresh = () => {
      setRefreshTick((t) => t + 1);
    };
    window.addEventListener("child-points-changed", handleRefresh);

    let cleanupChannel = () => {};
    if (typeof supabase.channel === "function") {
      const channel = supabase
        .channel("dashboard-check-ins")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "check_ins" },
          handleRefresh
        )
        .subscribe();
      cleanupChannel = () => {
        void channel.unsubscribe();
      };
    }

    return () => {
      window.removeEventListener("child-points-changed", handleRefresh);
      cleanupChannel();
    };
  }, [supabase]);

  // Update dashboard when selectedChildId changes (without refetching data)
  useEffect(() => {
    if (!rawDataRef.current) return;

    const { children, homeworks, checkIns } = rawDataRef.current;
    const nextDashboard = buildParentDashboard({
      children,
      homeworks,
      checkIns,
      date: selectedDate,
      month: selectedMonth,
      selectedChildId,
    });

    setDashboard(nextDashboard);
  }, [selectedChildId, selectedDate, selectedMonth]);

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedMonth(date.slice(0, 7));
  };

  const handleChangeMonth = (offset: number) => {
    const nextMonth = shiftMonth(selectedMonth, offset);
    setSelectedMonth(nextMonth);
    setSelectedDate(getFirstDayOfMonth(nextMonth));
  };

  const activeChildId =
    dashboard.summaries.some((summary) => summary.childId === selectedChildId)
      ? selectedChildId
      : getDefaultSelectedChildId(dashboard.summaries);

  useEffect(() => {
    if (dashboard.summaries.length === 0) {
      return;
    }

    if (
      !selectedChildId ||
      !dashboard.summaries.some((summary) => summary.childId === selectedChildId)
    ) {
      setSelectedChildId(getDefaultSelectedChildId(dashboard.summaries));
    }
  }, [dashboard.summaries, selectedChildId]);

  const selectedDetail =
    dashboard.selectedDayDetails.find(
      (detail) => detail.summary.childId === activeChildId
    ) ??
    dashboard.selectedDayDetails[0] ??
    null;

  const fetchReminders = async (parentId: string, month: string) => {
    try {
      const res = await fetch(
        `/api/reminders/send?parentId=${parentId}&month=${month}`
      );
      if (res.ok) {
        const data = await res.json();
        setReminderStates(data.reminderStates ?? []);
      }
    } catch {
      // Silently ignore fetch errors (e.g., no server in test environment)
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleReminderStateChange = async (
    homeworkId: string,
    childId: string,
    targetDate: string
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/reminders/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homework_id: homeworkId, child_id: childId, target_date: targetDate }),
    });
    if (res.ok) {
      const month = targetDate.substring(0, 7); // YYYY-MM
      await fetchReminders(session.user.id, month);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-white/80 backdrop-blur-md border-b border-forest-100 p-4 sticky top-0 z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="h-7 w-40 animate-pulse rounded bg-gray-200" />
            <div className="flex gap-2">
              <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-12 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-12 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-6 p-4">
          {/* ChildSelector skeleton — row of circular avatars */}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse flex shrink-0 flex-col items-center gap-1.5">
                <div className="h-14 w-14 rounded-full bg-gray-200" />
                <div className="h-3 w-14 rounded bg-gray-200" />
              </div>
            ))}
          </div>

          {/* Grid: left today+heatmap, right calendar+insights */}
          <section className="grid gap-6 xl:grid-cols-[1fr_380px] xl:items-start">
            {/* Left column */}
            <div className="space-y-6">
              {/* TodayOverview card skeleton */}
              <div className="animate-pulse rounded-3xl border border-forest-100 bg-white/90 p-5 shadow-sm">
                <div className="mb-4 h-5 w-32 rounded bg-gray-200" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-gray-200" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-36 rounded bg-gray-200" />
                        <div className="h-3 w-24 rounded bg-gray-200" />
                      </div>
                      <div className="h-7 w-16 rounded-full bg-gray-200" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Heatmap skeleton */}
              <div className="animate-pulse rounded-3xl border border-forest-200 bg-white/90 p-5 shadow-sm">
                <div className="mb-3 h-4 w-24 rounded bg-gray-200" />
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-3 w-full rounded bg-gray-200" />
                  ))}
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={`row2-${i}`} className="h-3 w-full rounded bg-gray-200" />
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* MonthCalendar skeleton — 7-col grid */}
              <div className="animate-pulse rounded-3xl border border-forest-100 bg-white/90 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="h-4 w-8 rounded bg-gray-200" />
                  <div className="h-5 w-24 rounded bg-gray-200" />
                  <div className="h-4 w-8 rounded bg-gray-200" />
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="mx-auto h-3 w-3 rounded bg-gray-200" />
                  ))}
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div key={`cal-${i}`} className="mx-auto h-8 w-8 rounded-full bg-gray-200" />
                  ))}
                </div>
              </div>
              {/* MonthlyInsights skeleton */}
              <div className="animate-pulse rounded-3xl border border-forest-100 bg-white/90 p-4 shadow-sm">
                <div className="mb-3 h-4 w-20 rounded bg-gray-200" />
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gray-200" />
                      <div className="h-3 flex-1 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white/80 backdrop-blur-md border-b border-forest-100 text-forest-800 p-4 sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <h1 className="text-xl font-bold">{t('parent.dashboard.title')}</h1>
          <div className="flex gap-2">
            <Link href="/homework">
              <Button size="sm" variant="primary">
                {t('parent.dashboard.homeworkManage')}
              </Button>
            </Link>
            <Link href="/children">
              <Button size="sm" variant="ghost">
                {t('parent.dashboard.children')}
              </Button>
            </Link>
            <Link href="/settings">
              <Button size="sm" variant="ghost">
                设置
              </Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={handleLogout}>
              {t('common.logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4">
        {dashboard.summaries.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-5 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-orange-100 shadow-[0_0_48px_rgba(251,146,60,0.12)] ring-1 ring-amber-200/40">
              <span className="text-7xl">🦊</span>
            </div>
            <h2 className="text-xl font-bold text-forest-700">
              {t('parent.dashboard.noChildren')}
            </h2>
            <p className="mt-2 text-forest-500">
              {t('parent.dashboard.noChildrenHint')}
            </p>
            <Link href="/children">
              <Button className="mt-5">{t('parent.dashboard.addChild')}</Button>
            </Link>
          </div>
        ) : (
          <>
            <ChildSelector
              summaries={dashboard.summaries}
              selectedId={activeChildId}
              onSelect={setSelectedChildId}
            />
            {/* 左右两栏布局：左边任务+热力图，右边日历+薄弱类型 */}
            <section className="grid gap-6 xl:grid-cols-[1fr_380px] xl:items-start">
              {/* 左侧：当天任务 + 时段热力图 */}
              <div className="space-y-6">
                {selectedDetail ? (
                  <TodayOverview
                    detail={selectedDetail}
                    selectedDate={selectedDate}
                    reminderStates={reminderStates}
                    onReminderStateChange={handleReminderStateChange}
                  />
                ) : null}
                <div className="rounded-3xl border border-forest-200 bg-white/90 p-5 shadow-sm">
                  <ParentCheckInHeatmap buckets={dashboard.checkInHeatmap ?? []} />
                </div>
              </div>
              {/* 右侧：月度日历 + 薄弱类型 */}
              <div className="space-y-6">
                <ParentMonthCalendar
                  days={dashboard.calendarDays}
                  selectedDate={selectedDate}
                  selectedMonth={selectedMonth}
                  monthlyStats={dashboard.monthlyStats}
                  onSelectDate={handleSelectDate}
                  onPreviousMonth={() => handleChangeMonth(-1)}
                  onNextMonth={() => handleChangeMonth(1)}
                />
                <ParentMonthlyInsights weakestTypes={dashboard.weakestTypes} />
                {activeChildId && <ReadingProgressPanel childId={activeChildId} />}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
