import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export function getHomeworksForDate(
  homeworks: Homework[],
  date: Date
): Homework[] {
  const todayStr = date.toISOString().split("T")[0];
  const dayOfWeek = date.getDay();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return homeworks.filter((hw) => {
    if (!hw.is_active) return false;

    if (hw.repeat_type === "daily") return true;

    if (hw.repeat_type === "weekly") {
      return hw.repeat_days?.includes(dayOfWeek);
    }

    if (hw.repeat_type === "interval" && hw.repeat_start_date && hw.repeat_interval) {
      const start = new Date(hw.repeat_start_date);
      const diffDays = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays % hw.repeat_interval === 0;
    }

    if (hw.repeat_type === "once") {
      return hw.repeat_start_date === todayStr;
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
    const key = date.toISOString().split("T")[0];
    const dayHomeworks = getHomeworksForDate(homeworks, date);
    const completed = dayHomeworks.filter((hw) =>
      checkIns.some(
        (ci) =>
          ci.homework_id === hw.id &&
          new Date(ci.completed_at) >= date &&
          new Date(ci.completed_at) < new Date(date.getTime() + 86400000)
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
    const d = new Date(ci.completed_at);
    return d >= weekStart && d < weekEnd;
  });
}
