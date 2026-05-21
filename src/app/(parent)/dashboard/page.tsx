"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateKey } from "@/lib/homework-utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";
import { Button } from "@/components/ui/Button";
import { ChildSelector } from "@/components/parent/ChildSelector";
import { ParentCheckInHeatmap } from "@/components/parent/ParentCheckInHeatmap";
import { ParentMonthCalendar } from "@/components/parent/ParentMonthCalendar";
import { ParentMonthlyInsights } from "@/components/parent/ParentMonthlyInsights";
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-space-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="animate-pulse h-8 w-40 rounded bg-ink-100" />
          <div className="animate-pulse h-8 w-16 rounded bg-ink-100" />
        </div>

        {/* Two-column skeleton */}
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Left column: task list + heatmap */}
          <div className="space-y-space-6">
            <div className="animate-pulse rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised">
              <div className="mb-3 h-5 w-32 rounded bg-ink-100" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-ink-100" />
                    <div className="h-12 flex-1 rounded bg-ink-100" />
                  </div>
                ))}
              </div>
            </div>
            <div className="animate-pulse h-24 rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised" />
          </div>
          {/* Right column: calendar + insights */}
          <div className="space-y-space-6">
            <div className="animate-pulse h-72 rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised">
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="mx-auto h-8 w-8 rounded-full bg-ink-100" />
                ))}
              </div>
            </div>
            <div className="animate-pulse h-32 rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-space-6">
      <div className="flex items-center justify-between">
        <h1 className="text-ui-2xl font-ui-display font-bold text-forest-800">{t('parent.dashboard.title')}</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          退出登录
        </Button>
      </div>

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
        </div>
      ) : (
        <>
          <ChildSelector
            summaries={dashboard.summaries}
            selectedId={activeChildId}
            onSelect={setSelectedChildId}
          />

          {/* 左右两栏布局：左边任务+热力图，右边日历+薄弱类型 */}
          <section className="grid gap-space-6 xl:grid-cols-[1fr_380px] xl:items-start">
            {/* 左侧：当天任务 + 时段热力图 */}
            <div className="space-y-space-6">
              {selectedDetail && activeChildId && activeChildId !== "__all__" ? (
                <TodayOverview
                  detail={selectedDetail}
                  selectedDate={selectedDate}
                  reminderStates={reminderStates}
                  onReminderStateChange={handleReminderStateChange}
                />
              ) : null}
              <div className="rounded-radius-xl border border-ink-300 bg-white p-space-5 shadow-elevation-raised">
                <ParentCheckInHeatmap buckets={dashboard.checkInHeatmap ?? []} />
              </div>
            </div>
            {/* 右侧：月度日历 + 薄弱类型 */}
            <div className="space-y-space-6">
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
            </div>
          </section>
        </>
      )}
    </div>
  );
}