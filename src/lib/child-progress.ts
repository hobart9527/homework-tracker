import type { Database } from "@/lib/supabase/types";
import { buildDailyTaskStatuses } from "@/lib/tasks/daily-task";
import { formatDateKey, parseDateValue } from "@/lib/homework-utils";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export type ChildMonthlySummary = {
  month: string;
  monthLabel: string;
  totalAssigned: number;
  completedCount: number;
  completionRate: number;
  totalPoints: number;
  activeDays: number;
  lateCount: number;
  onTimeRate: number;
};

export type ChildMonthlyCalendarDay = {
  date: string;
  totalCount: number;
  completedCount: number;
  lateCount: number;
  completionRate: number;
  pointsEarned: number;
};

export type ChildTypeInsight = {
  typeName: string;
  assignedCount: number;
  completedCount: number;
  completionRate: number;
};

export type ChildTimeHeatmapBucket = {
  hour: number;
  label: string;
  count: number;
  intensity: number;
};

export type ChildHabitInsight = {
  title: string;
  description: string;
  tone: "good" | "warn" | "tip";
};

export type ChildMonthlyProgress = {
  summary: ChildMonthlySummary;
  calendarDays: ChildMonthlyCalendarDay[];
  weakestTypes: ChildTypeInsight[];
  strongestTypes: ChildTypeInsight[];
  timeHeatmap: ChildTimeHeatmapBucket[];
  habitInsights: ChildHabitInsight[];
};

export function getAdjacentMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const base = new Date(year, monthIndex - 1 + delta, 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

export function isFutureMonth(month: string, currentMonth: string) {
  return month > currentMonth;
}

function createMonthDays(month: string): Date[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  const end = new Date(year, monthIndex, 0).getDate();

  return Array.from({ length: end }, (_, index) => {
    const day = new Date(start);
    day.setDate(index + 1);
    return day;
  });
}

function formatMonthLabel(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return `${year}年${monthIndex}月`;
}

function isCheckInInMonth(checkIn: CheckIn, month: string) {
  if (!checkIn.completed_at) {
    return false;
  }

  return formatDateKey(parseDateValue(checkIn.completed_at)).startsWith(month);
}

function buildTypeInsights(
  homeworks: Homework[],
  checkIns: CheckIn[],
  month: string
): ChildTypeInsight[] {
  const homeworkById = new Map(homeworks.map((homework) => [homework.id, homework]));
  const totals = new Map<string, { assignedCount: number; completedCount: number }>();

  for (const day of createMonthDays(month)) {
    const dayKey = formatDateKey(day);
    const statuses = buildDailyTaskStatuses(homeworks, checkIns, dayKey);

    for (const status of statuses) {
      const homework = homeworkById.get(status.homeworkId);
      const typeName = homework?.type_name || "未分类";
      const current = totals.get(typeName) ?? { assignedCount: 0, completedCount: 0 };
      current.assignedCount += 1;
      if (status.completed) {
        current.completedCount += 1;
      }
      totals.set(typeName, current);
    }
  }

  return Array.from(totals.entries())
    .map(([typeName, counts]) => ({
      typeName,
      assignedCount: counts.assignedCount,
      completedCount: counts.completedCount,
      completionRate:
        counts.assignedCount === 0 ? 0 : counts.completedCount / counts.assignedCount,
    }))
    .sort((left, right) => {
      if (left.completionRate !== right.completionRate) {
        return left.completionRate - right.completionRate;
      }

      if (right.assignedCount !== left.assignedCount) {
        return right.assignedCount - left.assignedCount;
      }

      return left.typeName.localeCompare(right.typeName, "zh-CN");
    });
}

function buildTimeHeatmap(checkIns: CheckIn[], month: string): ChildTimeHeatmapBucket[] {
  const counts = new Map<number, number>();

  for (const checkIn of checkIns) {
    if (!isCheckInInMonth(checkIn, month) || !checkIn.completed_at) {
      continue;
    }

    const hour = parseDateValue(checkIn.completed_at).getHours();
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  const maxCount = Math.max(...counts.values(), 0);

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    count: counts.get(hour) ?? 0,
    intensity: maxCount === 0 ? 0 : (counts.get(hour) ?? 0) / maxCount,
  }));
}

function buildHabitInsights(input: {
  summary: ChildMonthlySummary;
  weakestTypes: ChildTypeInsight[];
  strongestTypes: ChildTypeInsight[];
  timeHeatmap: ChildTimeHeatmapBucket[];
}): ChildHabitInsight[] {
  const insights: ChildHabitInsight[] = [];

  if (input.summary.lateCount > 0) {
    insights.push({
      title: "补打卡次数偏多",
      description: `这个月有 ${input.summary.lateCount} 次逾期完成，建议把最容易拖延的任务提前到放学后第一个学习时段。`,
      tone: "warn",
    });
  }

  const weakestType = input.weakestTypes[0];
  if (weakestType && weakestType.assignedCount > 0) {
    insights.push({
      title: `${weakestType.typeName} 需要优先补强`,
      description: `本月完成率 ${Math.round(
        weakestType.completionRate * 100
      )}% ，可以先把这类任务拆成更短的小节奏。`,
      tone: "tip",
    });
  }

  const hottestHour = [...input.timeHeatmap]
    .sort((left, right) => right.count - left.count || left.hour - right.hour)
    .find((bucket) => bucket.count > 0);

  if (hottestHour) {
    insights.push({
      title: `最常打卡时间在 ${hottestHour.label}`,
      description: `如果这个时段状态最好，可以尽量把高难度任务固定安排在 ${hottestHour.label} 前后完成。`,
      tone: "good",
    });
  }

  if (input.summary.completionRate >= 0.8) {
    insights.push({
      title: "本月节奏很稳",
      description: "整体完成率已经很高，继续保持固定开始时间，会更容易把状态延续下去。",
      tone: "good",
    });
  }

  return insights.slice(0, 3);
}

export function buildChildMonthlyProgress(input: {
  month: string;
  homeworks: Homework[];
  checkIns: CheckIn[];
}): ChildMonthlyProgress {
  const calendarDays = createMonthDays(input.month).map((day) => {
    const dayKey = formatDateKey(day);
    const statuses = buildDailyTaskStatuses(input.homeworks, input.checkIns, dayKey);
    const completedStatuses = statuses.filter((status) => status.completed);

    return {
      date: dayKey,
      totalCount: statuses.length,
      completedCount: completedStatuses.length,
      lateCount: completedStatuses.filter((status) => status.late).length,
      completionRate: statuses.length === 0 ? 0 : completedStatuses.length / statuses.length,
      pointsEarned: completedStatuses.reduce(
        (sum, status) => sum + (status.awardedPoints ?? 0),
        0
      ),
    };
  });

  const totalAssigned = calendarDays.reduce((sum, day) => sum + day.totalCount, 0);
  const completedCount = calendarDays.reduce((sum, day) => sum + day.completedCount, 0);
  const lateCount = calendarDays.reduce((sum, day) => sum + day.lateCount, 0);
  const totalPoints = calendarDays.reduce((sum, day) => sum + day.pointsEarned, 0);
  const activeDays = new Set(
    input.checkIns
      .filter((checkIn) => isCheckInInMonth(checkIn, input.month) && checkIn.completed_at)
      .map((checkIn) => formatDateKey(parseDateValue(checkIn.completed_at!)))
  ).size;

  const weakestTypes = buildTypeInsights(input.homeworks, input.checkIns, input.month);
  const strongestTypes = [...weakestTypes].reverse();
  const timeHeatmap = buildTimeHeatmap(input.checkIns, input.month);

  const summary: ChildMonthlySummary = {
    month: input.month,
    monthLabel: formatMonthLabel(input.month),
    totalAssigned,
    completedCount,
    completionRate: totalAssigned === 0 ? 0 : completedCount / totalAssigned,
    totalPoints,
    activeDays,
    lateCount,
    onTimeRate: completedCount === 0 ? 0 : (completedCount - lateCount) / completedCount,
  };

  return {
    summary,
    calendarDays,
    weakestTypes,
    strongestTypes,
    timeHeatmap,
    habitInsights: buildHabitInsights({
      summary,
      weakestTypes,
      strongestTypes,
      timeHeatmap,
    }),
  };
}
