"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDateKey } from "@/lib/homework-utils";
import type { Database } from "@/lib/supabase/types";
import { Button } from "@/components/ui/Button";
import { ChildSelector } from "@/components/parent/ChildSelector";
import { ParentMonthCalendar } from "@/components/parent/ParentMonthCalendar";
import { ParentMonthlyInsights } from "@/components/parent/ParentMonthlyInsights";
import { ParentCheckInHeatmap } from "@/components/parent/ParentCheckInHeatmap";
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
    makeupDays: 0,
  },
  checkInHeatmap: [],
};

export default function ParentDashboardPage() {
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
  }, [selectedDate, selectedMonth, supabase]);

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
    selectedChildId ?? getDefaultSelectedChildId(dashboard.summaries);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">🦊 加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-white p-4 sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <h1 className="text-xl font-bold">作业小管家</h1>
          <div className="flex gap-2">
            <Link href="/homework">
              <Button size="sm" variant="secondary">
                作业管理
              </Button>
            </Link>
            <Link href="/children">
              <Button size="sm" variant="ghost">
                孩子
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4">
        {dashboard.summaries.length === 0 ? (
          <div className="py-12 text-center">
            <span className="text-6xl">🦊</span>
            <h2 className="mt-4 text-xl font-bold text-forest-700">
              还没有添加孩子
            </h2>
            <p className="mt-2 text-forest-500">
              点击下方按钮添加您的第一个孩子
            </p>
            <Link href="/children">
              <Button className="mt-4">添加孩子</Button>
            </Link>
          </div>
        ) : (
          <>
            <ChildSelector
              summaries={dashboard.summaries}
              selectedId={activeChildId}
              onSelect={setSelectedChildId}
            />
            {selectedDetail ? (
              <TodayOverview
                detail={selectedDetail}
                selectedDate={selectedDate}
                reminderStates={reminderStates}
                onReminderStateChange={handleReminderStateChange}
              />
            ) : null}
            <ParentMonthCalendar
              days={dashboard.calendarDays}
              selectedDate={selectedDate}
              selectedMonth={selectedMonth}
              monthlyStats={dashboard.monthlyStats}
              onSelectDate={handleSelectDate}
              onPreviousMonth={() => handleChangeMonth(-1)}
              onNextMonth={() => handleChangeMonth(1)}
            />
            <ParentCheckInHeatmap buckets={dashboard.checkInHeatmap ?? []} />
            <ParentMonthlyInsights weakestTypes={dashboard.weakestTypes} />
          </>
        )}
      </main>
    </div>
  );
}
