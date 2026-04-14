"use client";

import { useState } from "react";
import { ChildWeekSummaryCard } from "@/components/child/ChildWeekSummaryCard";
import { DayHomeworkView } from "@/components/child/DayHomeworkView";
import { CheckInModal } from "@/components/child/CheckInModal";
import { PriorityHomeworkCard } from "@/components/child/PriorityHomeworkCard";
import { WeekCalendar } from "@/components/child/WeekCalendar";
import { buildDailyTaskStatuses } from "@/lib/tasks/daily-task";
import { getDailyCompletion, getWeekCheckIns, getWeekDays } from "@/lib/homework-utils";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

interface ChildLandingContentProps {
  homeworks: Homework[];
  checkIns: CheckIn[];
  onRefresh?: () => void;
  initialDate?: string;
}

export function ChildLandingContent({
  homeworks,
  checkIns,
  onRefresh,
  initialDate,
}: ChildLandingContentProps) {
  const [selectedDate, setSelectedDate] = useState(
    initialDate || new Date().toISOString().split("T")[0]
  );
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const weekDays = getWeekDays(new Date(`${selectedDate}T00:00:00`));
  const dailyCompletion = getDailyCompletion(homeworks, checkIns, weekDays);
  const weeklyCheckIns = getWeekCheckIns(checkIns, weekDays[0]);
  const completedDays = Object.values(dailyCompletion).filter(
    (value) => value.total > 0 && value.completed > 0
  ).length;
  const taskStatuses = buildDailyTaskStatuses(homeworks, checkIns, selectedDate);
  const priorityTask =
    taskStatuses.find((task) => !task.completed) || taskStatuses[0] || null;

  return (
    <main className="min-h-screen grid grid-cols-1 gap-4 p-4 pb-24 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <ChildWeekSummaryCard
          weeklyPoints={weeklyCheckIns.reduce((sum, item) => sum + item.points_earned, 0)}
          weeklyCheckIns={weeklyCheckIns.length}
          completedDays={completedDays}
        />
        <WeekCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          dailyCompletion={dailyCompletion}
        />
      </aside>
      <section className="space-y-4">
        <div className="rounded-[28px] bg-white p-5 shadow-md">
          <div className="text-sm text-forest-500">今日进度</div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <div className="text-3xl font-bold text-forest-700">
                {taskStatuses.filter((task) => task.completed).length}/{taskStatuses.length || 0}
              </div>
              <p className="text-sm text-forest-500">今天已经完成的任务数</p>
            </div>
            <div className="text-right text-sm text-forest-500">
              选中日期
              <div className="mt-1 font-medium text-forest-700">{selectedDate}</div>
            </div>
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
      {selectedHomework && (
        <CheckInModal
          homework={selectedHomework}
          isOpen={Boolean(selectedHomework)}
          onClose={() => setSelectedHomework(null)}
          onSuccess={() => {
            setSelectedHomework(null);
            onRefresh?.();
          }}
        />
      )}
    </main>
  );
}
