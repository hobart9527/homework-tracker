"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { AttachmentUploadStatus } from "@/lib/attachment-types";

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
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    formatDateKey(new Date())
  );
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [attachmentUploadStatuses, setAttachmentUploadStatuses] = useState<
    Record<string, AttachmentUploadStatus>
  >({});
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
        router.push("/child-login");
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
        <div className="mx-auto grid max-w-[1480px] gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6">
          {/* Left aside skeletons */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {/* WeekSummaryCard skeleton */}
            <div className="animate-pulse rounded-card bg-white/80 p-5 shadow-md ring-1 ring-forest-100">
              <div className="h-5 w-24 rounded-full bg-gray-200" />
              <div className="mt-3 flex gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-8 w-16 rounded-lg bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-8 w-16 rounded-lg bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-8 w-16 rounded-lg bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
              </div>
            </div>
            {/* WeekCalendar skeleton — 7-col grid */}
            <div className="animate-pulse rounded-card bg-white/80 p-4 shadow-md ring-1 ring-forest-100">
              <div className="mb-3 h-4 w-20 rounded bg-gray-200" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="space-y-1 text-center">
                    <div className="mx-auto h-3 w-8 rounded bg-gray-200" />
                    <div className="mx-auto h-8 w-8 rounded-full bg-gray-200" />
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Right section skeletons */}
          <section className="animate-pulse space-y-4 rounded-[32px] bg-white/85 p-4 shadow-lg ring-1 ring-forest-100 backdrop-blur lg:p-6">
            {/* PriorityHomeworkCard skeleton */}
            <div className="rounded-[20px] border border-forest-100 bg-forest-50/50 p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-48 rounded bg-gray-200" />
                </div>
                <div className="h-8 w-20 rounded-full bg-gray-200" />
              </div>
            </div>
            {/* Task card skeletons */}
            <div className="space-y-3 pt-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="h-6 w-20 rounded bg-gray-200" />
                <div className="h-4 w-12 rounded bg-gray-200" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-forest-100 bg-white p-3"
                >
                  <div className="h-8 w-8 rounded-lg bg-gray-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-40 rounded bg-gray-200" />
                    <div className="h-3 w-24 rounded bg-gray-200" />
                  </div>
                  <div className="h-8 w-8 rounded-full bg-gray-200" />
                </div>
              ))}
            </div>
          </section>
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
            <div className="rounded-card border border-dashed border-forest-200 bg-white/80 p-5 shadow-sm">
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
            attachmentUploadStatuses={attachmentUploadStatuses}
          />
        </section>
      </div>

      {selectedHomework && (
        <CheckInModal
          homework={selectedHomework}
          targetDate={selectedDate}
          isOpen={Boolean(selectedHomework)}
          onClose={() => setSelectedHomework(null)}
          onSuccess={(checkIn) => {
            if (checkIn) {
              setCheckIns((prev) => [...prev, checkIn as CheckIn]);
            } else {
              fetchData();
            }
          }}
          onAttachmentUploadStatusChange={(status) => {
            setAttachmentUploadStatuses((prev) => ({
              ...prev,
              [status.homeworkId]: status,
            }));
          }}
        />
      )}
    </main>
  );
}
