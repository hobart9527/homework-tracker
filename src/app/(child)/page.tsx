"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getWeekDays, getDailyCompletion, getWeekCheckIns } from "@/lib/homework-utils";
import { StatCard } from "@/components/child/StatCard";
import { WeekCalendar } from "@/components/child/WeekCalendar";
import { DayHomeworkView } from "@/components/child/DayHomeworkView";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export default function ChildLandingPage() {
  const supabase = createClient();
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dailyCompletion, setDailyCompletion] = useState<
    Record<string, { completed: number; total: number }>
  >({});
  const [weekStart, setWeekStart] = useState(new Date());

  const fetchData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const today = new Date();
    const monday = new Date(today);
    const dayOfWeek = today.getDay();
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const [hwRes, ciRes] = await Promise.all([
      supabase
        .from("homeworks")
        .select("*")
        .eq("child_id", session.user.id)
        .eq("is_active", true),
      supabase
        .from("check_ins")
        .select("*")
        .eq("child_id", session.user.id)
        .gte("completed_at", monday.toISOString())
        .lte("completed_at", sunday.toISOString()),
    ]);

    if (hwRes.data) setHomeworks(hwRes.data);
    if (ciRes.data) setCheckIns(ciRes.data);

    // Compute week completion
    const weekDays = getWeekDays(today);
    if (hwRes.data) {
      setDailyCompletion(
        getDailyCompletion(hwRes.data, ciRes.data || [], weekDays)
      );
    }

    setWeekStart(monday);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [supabase]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 pb-24">
        <div className="text-2xl">🦊 加载中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 pb-24">
      {/* Left column: stats + calendar */}
      <aside className="lg:col-span-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon="⭐" value={checkIns.reduce((sum, ci) => sum + (ci.points_earned || 0), 0)} label="本周积分" />
          <StatCard icon="📝" value={`${checkIns.length}`} label="本周打卡" />
          <StatCard
            icon="✓"
            value={Object.values(dailyCompletion).reduce((s, v) => s + v.completed, 0)}
            label="本周完成"
          />
        </div>
        <WeekCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          dailyCompletion={dailyCompletion}
        />
      </aside>

      {/* Right column: homework list */}
      <section className="lg:col-span-8 overflow-y-auto">
        <DayHomeworkView
          date={selectedDate}
          homeworks={homeworks}
          checkIns={checkIns}
          onRefresh={fetchData}
        />
      </section>
    </main>
  );
}
