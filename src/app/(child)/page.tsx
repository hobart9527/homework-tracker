"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckInModal } from "@/components/child/CheckInModal";
import { ChildWeekSummaryCard } from "@/components/child/ChildWeekSummaryCard";
import { DayHomeworkView } from "@/components/child/DayHomeworkView";
import { PriorityHomeworkCard } from "@/components/child/PriorityHomeworkCard";
import { WeekCalendar } from "@/components/child/WeekCalendar";
import {
  formatDateKey,
  getDailyCompletion,
  getLocalDayBounds,
  getWeekCheckIns,
  getWeekDays,
} from "@/lib/homework-utils";
import { buildDailyTaskStatuses } from "@/lib/tasks/daily-task";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export default function ChildLandingPage() {
  const supabase = createClient();
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(
    formatDateKey(new Date())
  );
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);

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

    const today = new Date();
    const weekDays = getWeekDays(today);
    const { start: weekStart } = getLocalDayBounds(weekDays[0]);
    const { end: weekEnd } = getLocalDayBounds(weekDays[6]);

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
        .gte("completed_at", weekStart)
        .lte("completed_at", weekEnd),
    ]);

    setHomeworks(homeworkResponse.data || []);
    setCheckIns(checkInResponse.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const weekDays = getWeekDays(selectedDateObject);
  const dailyCompletion = getDailyCompletion(homeworks, checkIns, weekDays);
  const weeklyCheckIns = getWeekCheckIns(checkIns, weekDays[0]);
  const completedDays = Object.values(dailyCompletion).filter(
    (value) => value.total > 0 && value.completed > 0
  ).length;
  const taskStatuses = buildDailyTaskStatuses(homeworks, checkIns, selectedDate);
  const priorityTask =
    taskStatuses.find((task) => !task.completed) || taskStatuses[0] || null;

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FDFCF8] to-[#F4F8FF] p-4 lg:p-6">
        <div className="flex min-h-[70vh] items-center justify-center rounded-[32px] bg-white/80 text-2xl shadow-lg ring-1 ring-forest-100">
          🦊 加载中...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FDFCF8] to-[#F4F8FF] p-4 text-forest-700 lg:p-6">
      <div className="mx-auto grid max-w-[1480px] gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <ChildWeekSummaryCard
            weeklyPoints={weeklyCheckIns.reduce((sum, item) => sum + (item.points_earned || 0), 0)}
            weeklyCheckIns={weeklyCheckIns.length}
            completedDays={completedDays}
          />
          <WeekCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            dailyCompletion={dailyCompletion}
          />
        </aside>

        <section className="space-y-4 rounded-[32px] bg-white/85 p-4 shadow-lg ring-1 ring-forest-100 backdrop-blur lg:p-6">
          <div className="flex flex-col gap-4 rounded-[28px] bg-gradient-to-r from-forest-50 via-white to-amber-50 p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-medium text-forest-500">今日进度</div>
              <div className="mt-2 text-3xl font-bold text-forest-700">
                {taskStatuses.filter((task) => task.completed).length}/{taskStatuses.length || 0}
              </div>
              <p className="mt-1 text-sm text-forest-500">右侧是今天要完成的任务，先抓最重要的。</p>
            </div>
            <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-forest-600 shadow-sm ring-1 ring-forest-100">
              {selectedDate}
            </div>
          </div>

          <PriorityHomeworkCard
            task={priorityTask}
            onOpen={() => {
              if (!priorityTask) {
                return;
              }

              const homework = homeworks.find((item) => item.id === priorityTask.homeworkId);
              if (homework) {
                setSelectedHomework(homework);
              }
            }}
          />

          <DayHomeworkView
            date={selectedDate}
            homeworks={homeworks}
            checkIns={checkIns}
            onSelectHomework={setSelectedHomework}
          />
        </section>
      </div>

      {selectedHomework && (
        <CheckInModal
          homework={selectedHomework}
          isOpen={Boolean(selectedHomework)}
          onClose={() => setSelectedHomework(null)}
          onSuccess={() => {
            fetchData();
          }}
        />
      )}
    </main>
  );
}
