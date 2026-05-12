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
import { TodayActivityFeed } from "@/components/parent/TodayActivityFeed";
import { IncompleteHomeworkAlert } from "@/components/parent/IncompleteHomeworkAlert";
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
  recentCheckIns: [],
  incompleteHomeworks: [],
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
      selectedChildId: selectedChildId === "__all__" ? null : selectedChildId,
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

    // "__all__" is a valid sentinel — don't reset it
    if (selectedChildId === "__all__") {
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

  const handleRemindFromAlert = async (homeworkId: string, childId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/reminders/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homework_id: homeworkId, child_id: childId, target_date: selectedDate }),
    });
    if (res.ok) {
      const month = selectedDate.substring(0, 7);
      await fetchReminders(session.user.id, month);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-space-6 py-space-6 space-y-space-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="animate-pulse h-8 w-40 rounded bg-ink-100" />
          <div className="animate-pulse h-8 w-16 rounded bg-ink-100" />
        </div>

        {/* Section A skeleton: ActivityFeed + IncompleteAlert */}
        <div>
          <div className="mb-space-4 flex items-baseline gap-2">
            <div className="animate-pulse h-6 w-20 rounded bg-ink-100" />
            <div className="animate-pulse h-4 w-16 rounded bg-ink-100" />
          </div>
          <div className="space-y-space-4">
            <div className="animate-pulse h-20 rounded-radius-xl border border-ink-200 bg-white p-space-4">
              <div className="flex gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 w-36 shrink-0 rounded-radius-md bg-ink-100" />
                ))}
              </div>
            </div>
            <div className="animate-pulse rounded-radius-xl border border-ink-200 bg-white p-space-5">
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-radius-md bg-ink-100" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-28 rounded bg-ink-100" />
                      <div className="h-3 w-20 rounded bg-ink-100" />
                    </div>
                    <div className="h-7 w-12 rounded-full bg-ink-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section B skeleton: tabs + calendar grid + right panel */}
        <div>
          <div className="mb-space-4 flex items-baseline gap-2">
            <div className="animate-pulse h-6 w-20 rounded bg-ink-100" />
            <div className="animate-pulse h-4 w-24 rounded bg-ink-100" />
          </div>
          {/* Tab pills skeleton */}
          <div className="flex gap-1 overflow-x-auto pb-1 border-b-2 border-ink-200">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse h-9 w-24 rounded-t-radius-md bg-ink-100" />
            ))}
          </div>
          <div className="mt-space-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-space-6 lg:col-span-2">
              <div className="animate-pulse rounded-radius-xl border border-ink-200 bg-white p-space-4 shadow-elevation-raised">
                <div className="mb-3 flex items-center justify-between">
                  <div className="h-4 w-8 rounded bg-ink-100" />
                  <div className="h-5 w-24 rounded bg-ink-100" />
                  <div className="h-4 w-8 rounded bg-ink-100" />
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="mx-auto h-3 w-3 rounded bg-ink-100" />
                  ))}
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div key={`cal-${i}`} className="mx-auto h-8 w-8 rounded-full bg-ink-100" />
                  ))}
                </div>
              </div>
              <div className="animate-pulse rounded-radius-xl border border-ink-200 bg-white p-space-5 shadow-elevation-raised">
                <div className="mb-3 h-4 w-20 rounded bg-ink-100" />
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-ink-100" />
                      <div className="h-3 flex-1 rounded bg-ink-100" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="lg:col-span-1">
              <div className="animate-pulse rounded-radius-xl border border-ink-200 bg-white p-space-5 shadow-elevation-raised">
                <div className="mb-4 h-5 w-32 rounded bg-ink-100" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-radius-md bg-ink-100" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-36 rounded bg-ink-100" />
                        <div className="h-3 w-24 rounded bg-ink-100" />
                      </div>
                      <div className="h-7 w-16 rounded-full bg-ink-100" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-space-6 py-space-6 space-y-space-8">
      {dashboard.summaries.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-5 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-honey-50 to-orange-100 shadow-elevation-floating ring-1 ring-honey-200/40">
            <span className="text-7xl">🦊</span>
          </div>
          <h2 className="text-xl font-bold text-forest-700">
            {t('parent.dashboard.noChildren')}
          </h2>
          <p className="mt-2 text-ink-500">
            {t('parent.dashboard.noChildrenHint')}
          </p>
          <Link href="/children">
            <Button className="mt-5">{t('parent.dashboard.addChild')}</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Page header */}
          <div className="flex items-center justify-between">
            <h1 className="text-ui-2xl font-ui-display font-bold text-forest-800">{t('parent.dashboard.title')}</h1>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              {t('common.logout')}
            </Button>
          </div>

          {/* ===== SECTION A: 今日全局 ===== */}
          <section aria-labelledby="global-heading">
            <div className="mb-space-4 flex items-baseline gap-2">
              <h2 id="global-heading" className="text-ui-lg font-ui-display font-bold text-forest-800">今日全局</h2>
              <span className="text-ui-xs text-ink-400">所有孩子</span>
            </div>
            <div className="space-y-space-4">
              <TodayActivityFeed checkIns={dashboard.recentCheckIns} compact />
              <IncompleteHomeworkAlert
                items={dashboard.incompleteHomeworks}
                onRemind={handleRemindFromAlert}
              />
            </div>
          </section>

          {/* ===== SECTION B: 孩子详情 ===== */}
          <section aria-labelledby="child-heading">
            <div className="mb-space-4 flex items-baseline gap-2">
              <h2 id="child-heading" className="text-ui-lg font-ui-display font-bold text-forest-800">孩子详情</h2>
              <span className="text-ui-xs text-ink-400">选择孩子查看个人数据</span>
            </div>
            <ChildSelector
              summaries={dashboard.summaries}
              selectedId={activeChildId}
              onSelect={setSelectedChildId}
            />
            <div className="mt-space-4 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
              {/* Left: 2/3 */}
              <div className="space-y-space-6 lg:col-span-2">
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
                <div className="rounded-radius-xl border border-ink-200 bg-white p-space-5 shadow-elevation-raised">
                  <ParentCheckInHeatmap buckets={dashboard.checkInHeatmap ?? []} />
                </div>
                {activeChildId && activeChildId !== "__all__" && (
                  <ReadingProgressPanel childId={activeChildId} />
                )}
              </div>
              {/* Right: 1/3 */}
              <div className="lg:col-span-1">
                {activeChildId && activeChildId !== "__all__" && selectedDetail ? (
                  <div className="lg:sticky lg:top-6">
                    <TodayOverview
                      detail={selectedDetail}
                      selectedDate={selectedDate}
                      reminderStates={reminderStates}
                      onReminderStateChange={handleReminderStateChange}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
