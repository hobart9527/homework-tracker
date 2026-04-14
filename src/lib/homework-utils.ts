import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateValue(value: string): Date {
  return value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
}

export function getHomeworksForDate(
  homeworks: Homework[],
  date: Date
): Homework[] {
  const todayStr = formatDateKey(date);
  const dayOfWeek = date.getDay();

  return homeworks.filter((hw) => {
    if (!hw.is_active) return false;

    if (hw.repeat_type === "daily") return true;

    if (hw.repeat_type === "weekly") {
      return hw.repeat_days?.includes(dayOfWeek);
    }

    if (hw.repeat_type === "interval" && hw.repeat_start_date && hw.repeat_interval) {
      const start = startOfLocalDay(parseDateValue(hw.repeat_start_date));
      const current = startOfLocalDay(date);
      const diffDays = Math.floor((current.getTime() - start.getTime()) / MS_PER_DAY);
      return diffDays >= 0 && diffDays % hw.repeat_interval === 0;
    }

    if (hw.repeat_type === "once") {
      return hw.repeat_start_date ? formatDateKey(parseDateValue(hw.repeat_start_date)) === todayStr : false;
    }

    return false;
  });
}

export function getDailyCompletion(
  homeworks: Homework[],
  checkIns: CheckIn[],
  dateRange: Date[]
): Record<string, { completed: number; total: number }> {
  const result: Record<string, { completed: number; total: number }> = {};

  for (const date of dateRange) {
    const key = formatDateKey(date);
    const dayHomeworks = getHomeworksForDate(homeworks, date);
    const completed = dayHomeworks.filter((hw) =>
      checkIns.some(
        (ci) =>
          ci.homework_id === hw.id &&
          ci.completed_at !== null &&
          formatDateKey(parseDateValue(ci.completed_at)) === key
      )
    ).length;

    result[key] = { completed, total: dayHomeworks.length };
  }

  return result;
}

export function getWeekDays(baseDate: Date): Date[] {
  const day = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1));

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function getWeekCheckIns(checkIns: CheckIn[], weekStart: Date): CheckIn[] {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  return checkIns.filter((ci) => {
    if (!ci.completed_at) {
      return false;
    }

    const d = new Date(ci.completed_at);
    return d >= weekStart && d < weekEnd;
  });
}

export function isAfterCutoff(cutoffTime: string | null, now: Date): boolean {
  if (!cutoffTime) {
    return false;
  }

  const [hours, minutes] = cutoffTime.split(":").map(Number);
  const cutoff = new Date(now);
  cutoff.setHours(hours, minutes, 0, 0);

  return now > cutoff;
}

export function getLocalDayBounds(date: Date): { start: string; end: string } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
