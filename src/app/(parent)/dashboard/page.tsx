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
import { TodayOverview } from "@/components/parent/TodayOverview";
import {
  buildParentDashboard,
  getDefaultSelectedChildId,
  type ParentMonthlyDashboard,
} from "@/lib/parent-dashboard";

type Child = Database["public"]["Tables"]["children"]["Row"];
type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

const EMPTY_DASHBOARD: ParentMonthlyDashboard = {
  summaries: [],
  calendarDays: [],
  selectedDayDetails: [],
  weakestTypes: [],
};

export default function ParentDashboardPage() {
  const [supabase] = useState(() => createClient());
  const [dashboard, setDashboard] =
    useState<ParentMonthlyDashboard>(EMPTY_DASHBOARD);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [loading, setLoading] = useState(true);

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
        const [{ data: homeworksData }, { data: checkInsData }] =
          await Promise.all([
            supabase
              .from("homeworks")
              .select("*")
              .eq("created_by", session.user.id),
            supabase
              .from("check_ins")
              .select("*")
              .in("child_id", childIds),
          ]);

        const nextDashboard = buildParentDashboard({
          children,
          homeworks: (homeworksData ?? []) as Homework[],
          checkIns: (checkInsData ?? []) as CheckIn[],
          date: selectedDate,
        });

        if (cancelled) {
          return;
        }

        setDashboard(nextDashboard);
        setSelectedChildId((current) =>
          current ?? getDefaultSelectedChildId(nextDashboard.summaries)
        );
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
  }, [selectedDate, supabase]);

  const activeChildId =
    selectedChildId ?? getDefaultSelectedChildId(dashboard.summaries);
  const selectedDetail =
    dashboard.selectedDayDetails.find(
      (detail) => detail.summary.childId === activeChildId
    ) ??
    dashboard.selectedDayDetails[0] ??
    null;

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
            <ParentMonthCalendar
              days={dashboard.calendarDays}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            {selectedDetail ? (
              <TodayOverview detail={selectedDetail} selectedDate={selectedDate} />
            ) : null}
            <ParentMonthlyInsights weakestTypes={dashboard.weakestTypes} />
          </>
        )}
      </main>
    </div>
  );
}
