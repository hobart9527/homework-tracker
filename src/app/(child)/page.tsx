"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckInModal } from "@/components/child/CheckInModal";
import { ChildWeekSummaryCard } from "@/components/child/ChildWeekSummaryCard";
import { DayHomeworkView } from "@/components/child/DayHomeworkView";
import { PriorityHomeworkCard } from "@/components/child/PriorityHomeworkCard";
import { WeekCalendar } from "@/components/child/WeekCalendar";
import {
  formatDateKey,
  getDailyCompletion,
  getWeekCheckIns,
  getWeekDays,
} from "@/lib/homework-utils";
import { buildDailyTaskStatuses } from "@/lib/tasks/daily-task";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

function getHistoricalHomeworksForDate(homeworks: Homework[], date: string) {
  const today = formatDateKey(new Date());

  if (date < today) {
    return homeworks.map((homework) => ({
      ...homework,
      is_active: true,
    })) as Homework[];
  }

  return homeworks;
}

export default function ChildLandingPage() {
  const { t } = useTranslation();
  const [supabase] = useState(() => createClient());
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    formatDateKey(new Date())
  );
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
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
        return;
      }

      const [homeworkResponse, checkInResponse] = await Promise.all([
        supabase.from("homeworks").select("*").eq("child_id", session.user.id),
        supabase
          .from("check_ins")
          .select("*")
          .eq("child_id", session.user.id)
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
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const weekDays = getWeekDays(selectedDateObject);
  const dailyCompletion = weekDays.reduce<Record<string, { completed: number; total: number }>>(
    (result, day) => {
      const dateKey = formatDateKey(day);
      const visibleHomeworks = getHistoricalHomeworksForDate(homeworks, dateKey);
      const completion = getDailyCompletion(visibleHomeworks, checkIns, [day])[dateKey];

      result[dateKey] = completion;
      return result;
    },
    {}
  );
  const weeklyCheckIns = getWeekCheckIns(checkIns, weekDays[0]);
  const completedDays = Object.values(dailyCompletion).filter(
    (value) => value.total > 0 && value.completed > 0
  ).length;
  const visibleHomeworks = getHistoricalHomeworksForDate(homeworks, selectedDate);
  const taskStatuses = buildDailyTaskStatuses(visibleHomeworks, checkIns, selectedDate);
  const priorityTask =
    taskStatuses.find((task) => !task.completed) || taskStatuses[0] || null;

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FDFCF8] to-[#F4F8FF] p-4 lg:p-6">
        <div className="flex min-h-[70vh] items-center justify-center rounded-[32px] bg-white/80 text-2xl shadow-lg ring-1 ring-forest-100">
          {t('child.page.loading')}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#F6FBF8] via-[#FDFCF8] to-[#F4F8FF] p-4 lg:p-6">
        <div
          role="alert"
          className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center rounded-[32px] bg-white/90 p-6 text-center shadow-lg ring-1 ring-forest-100"
        >
          <div>
            <div className="text-2xl font-bold text-forest-700">{t('child.page.error')}</div>
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
          {taskStatuses.length > 0 && taskStatuses.every((task) => task.completed) ? (
            <div className="rounded-[28px] border border-dashed border-forest-200 bg-white/80 p-5 shadow-sm">
              <div className="text-sm font-medium text-forest-600">{t('child.priorityCard.greatJob')}</div>
              <div className="mt-3 text-lg font-bold text-forest-700">{t('child.priorityCard.allDone')}</div>
              <p className="mt-1 text-sm text-forest-500">{t('child.priorityCard.allDoneHint')}</p>
            </div>
          ) : (
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
          )}

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
