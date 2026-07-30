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
import { buildDailyTaskStatuses, type LearningEventSource, loadAutoSourcesByCheckInId } from "@/lib/tasks/daily-task";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/lib/supabase/types";
import type { AttachmentUploadStatus } from "@/lib/attachment-types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

interface ChildLandingClientProps {
  initialHomeworks: Homework[];
  initialCheckIns: CheckIn[];
  initialAutoSources: Record<string, LearningEventSource>;
  locale: string;
}

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

export default function ChildLandingClient({
  initialHomeworks,
  initialCheckIns,
  initialAutoSources,
  locale,
}: ChildLandingClientProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [homeworks, setHomeworks] = useState<Homework[]>(initialHomeworks);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  const [autoSourcesByCheckInId, setAutoSourcesByCheckInId] = useState<
    Record<string, LearningEventSource>
  >(initialAutoSources);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    formatDateKey(new Date())
  );
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [attachmentUploadStatuses, setAttachmentUploadStatuses] = useState<
    Record<string, AttachmentUploadStatus>
  >({});
  const requestIdRef = useRef(0);
  const initialFetchSkipped = useRef(false);

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
        router.push(`/${locale}/child-login`);
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

      // Refresh auto-sources alongside check-ins.
      try {
        const ids = (checkInResponse.data || []).map((ci) => ci.id);
        const map = await loadAutoSourcesByCheckInId({
          supabase,
          checkInIds: ids,
        });
        setAutoSourcesByCheckInId(map || {});
      } catch {
        // Non-fatal: keep stale auto sources; user can refresh.
      }
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
  }, [supabase, router, locale]);

  useEffect(() => {
    // Skip initial fetch — data already provided via props from server component
    if (!initialFetchSkipped.current) {
      initialFetchSkipped.current = true;
      return;
    }
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
  const taskStatuses = buildDailyTaskStatuses(
    visibleHomeworks,
    checkIns,
    selectedDate,
    autoSourcesByCheckInId
  );
  const priorityTask =
    taskStatuses.find((task) => !task.completed) || taskStatuses[0] || null;

  if (loading) {
    return (
      <main className="min-h-screen bg-cream-50 p-4 lg:p-6">
        <div className="mx-auto grid max-w-[1480px] gap-4 lg:grid-cols-[minmax(360px,22rem)_1fr] xl:grid-cols-[420px_1fr] lg:gap-6">
          {/* Left aside skeletons */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {/* WeekSummaryCard skeleton */}
            <div className="animate-pulse rounded-radius-xl bg-white/80 p-5 shadow-elevation-floating ring-1 ring-cream-200">
              <div className="h-5 w-24 rounded-full bg-ink-100" />
              <div className="mt-3 flex gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-8 w-16 rounded-lg bg-ink-100" />
                  <div className="h-3 w-20 rounded bg-ink-100" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-8 w-16 rounded-lg bg-ink-100" />
                  <div className="h-3 w-20 rounded bg-ink-100" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-8 w-16 rounded-lg bg-ink-100" />
                  <div className="h-3 w-20 rounded bg-ink-100" />
                </div>
              </div>
            </div>
            {/* WeekCalendar skeleton — 7-col grid */}
            <div className="animate-pulse rounded-radius-xl bg-white/80 p-4 shadow-elevation-floating ring-1 ring-cream-200">
              <div className="mb-3 h-4 w-20 rounded bg-ink-100" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="space-y-1 text-center">
                    <div className="mx-auto h-3 w-8 rounded bg-ink-100" />
                    <div className="mx-auto h-8 w-8 rounded-full bg-ink-100" />
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Right section skeletons */}
          <section className="animate-pulse space-y-4 rounded-radius-2xl bg-white/85 p-4 shadow-elevation-modal ring-1 ring-cream-200 backdrop-blur lg:p-6">
            {/* PriorityHomeworkCard skeleton */}
            <div className="rounded-radius-xl border border-cream-200 bg-cream-50/50 p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-ink-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-ink-100" />
                  <div className="h-3 w-48 rounded bg-ink-100" />
                </div>
                <div className="h-8 w-20 rounded-full bg-ink-100" />
              </div>
            </div>
            {/* Task card skeletons */}
            <div className="space-y-3 pt-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="h-6 w-20 rounded bg-ink-100" />
                <div className="h-4 w-12 rounded bg-ink-100" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-cream-200 bg-white p-3"
                >
                  <div className="h-8 w-8 rounded-lg bg-ink-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-40 rounded bg-ink-100" />
                    <div className="h-3 w-24 rounded bg-ink-100" />
                  </div>
                  <div className="h-8 w-8 rounded-full bg-ink-100" />
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
      <main className="min-h-screen bg-cream-50 p-4 lg:p-6">
        <div
          role="alert"
          className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center rounded-radius-2xl bg-white/90 p-6 text-center shadow-elevation-modal ring-1 ring-cream-200"
        >
          <div>
            <div className="text-2xl font-bold text-forest-700">{t('child.page.error')}</div>
            <p className="mt-2 text-sm text-ink-500">{error}</p>
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
    <main className="min-h-screen bg-cream-50 p-4 text-forest-700 lg:p-6">
      <div className="mx-auto grid max-w-[1480px] gap-4 lg:grid-cols-[minmax(360px,22rem)_1fr] xl:grid-cols-[420px_1fr] lg:gap-6">
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

        <section className="space-y-4 rounded-radius-2xl bg-white/85 p-4 shadow-elevation-modal ring-1 ring-cream-200 backdrop-blur lg:p-6">
          {taskStatuses.length > 0 && taskStatuses.every((task) => task.completed) ? (
            <div className="rounded-radius-xl border border-dashed border-cream-200 bg-white/80 p-5 shadow-elevation-raised">
              <div className="text-sm font-medium text-forest-600">{t('child.priorityCard.greatJob')}</div>
              <div className="mt-3 text-lg font-bold text-forest-700">{t('child.priorityCard.allDone')}</div>
              <p className="mt-1 text-sm text-ink-500">{t('child.priorityCard.allDoneHint')}</p>
            </div>
          ) : (
            <PriorityHomeworkCard
              task={priorityTask}
              actionLabel={priorityTask?.platformUrl && priorityTask.typeIcon !== "📚" && priorityTask.typeIcon !== "📖" ? "去平台" : undefined}
              onOpen={() => {
                if (!priorityTask) return;

                // 阅读类型任务直接跳转到阅读页
                if (priorityTask.typeIcon === "📚" || priorityTask.typeIcon === "📖") {
                  router.push(`/${locale}/reading?lang=${priorityTask.typeIcon === "📖" ? "zh" : "en"}`);
                  return;
                }

                // 平台链接任务直接打开新窗口
                if (priorityTask.platformUrl) {
                  window.open(priorityTask.platformUrl, '_blank', 'noopener,noreferrer');
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
            autoSourcesByCheckInId={autoSourcesByCheckInId}
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
