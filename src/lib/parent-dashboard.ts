import type { Database } from "@/lib/supabase/types";
import { formatDateKey, getHomeworksForDate, parseDateValue } from "@/lib/homework-utils";
import { buildDailyTaskStatuses } from "@/lib/tasks/daily-task";

type Child = Database["public"]["Tables"]["children"]["Row"];
type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

export type ParentChildDashboardSummary = {
  childId: string;
  childName: string;
  avatar: string | null;
  completedCount: number;
  totalCount: number;
  todayPoints: number;
  overdueCount: number;
  makeupCount: number;
  outstandingCount: number;
  topNotice: string;
};

export type ParentReminderState = {
  homeworkId: string;
  targetDate: string;
  status: "sent_sms" | "resolved_completed" | "escalated_call" | "failed";
  escalateAfter: string | null;
};

export type ParentChildDashboardDetail = {
  summary: ParentChildDashboardSummary;
  tasks: Array<{
    homeworkId?: string;
    title: string;
    typeIcon: string | null;
    cutoffTime: string | null;
    proofType: "photo" | "audio" | null;
    statusText: string;
    scored: boolean;
    awardedPoints: number;
    reminderState?: ParentReminderState | null;
  }>;
};

export type ParentCalendarDayTooltip = {
  assignedCount: number;
  completedCount: number;
  lateCompletedCount: number;
  pendingTitles: string[];
};

export type ParentCalendarDay = {
  date: string;
  totalCount: number;
  completedCount: number;
  lateCompletedCount: number;
  outstandingCount: number;
  tooltip?: ParentCalendarDayTooltip;
};

export type ParentMonthlyInsight = {
  typeName: string;
  assignedCount: number;
  completedCount: number;
  completionRate: number;
};

export type ParentMonthlyStats = {
  completionRate: number;
  onTimeRate: number;
  totalPoints: number;
  makeupDays: number;
};

export type ParentCheckInHeatmapBucket = {
  hour: number;
  count: number;
};

export type ParentMonthlyDashboard = {
  summaries: ParentChildDashboardSummary[];
  calendarDays: ParentCalendarDay[];
  selectedDayDetails: ParentChildDashboardDetail[];
  weakestTypes: ParentMonthlyInsight[];
  monthlyStats?: ParentMonthlyStats;
  checkInHeatmap?: ParentCheckInHeatmapBucket[];
};

type ParentDashboardInput = {
  children: Child[];
  homeworks: Homework[];
  checkIns: CheckIn[];
  date: string;
  month?: string;
  reminderStates?: ParentReminderState[];
};

type ChildDashboardBuild = {
  summary: ParentChildDashboardSummary;
  detail: ParentChildDashboardDetail;
};

type MonthlyAggregation = {
  assignedCount: number;
  completedCount: number;
  onTimeCount: number;
  totalPoints: number;
  makeupDays: number;
};

function isHomeworkOverdue(homework: Homework, date: string): boolean {
  if (!homework.repeat_end_date) {
    return false;
  }

  return formatDateKey(parseDateValue(homework.repeat_end_date)) < date;
}

function getStatusText(input: {
  completed: boolean;
  late: boolean;
  overdue: boolean;
}): string {
  if (input.completed && input.late) {
    return "逾期完成";
  }

  if (input.completed) {
    return "已完成";
  }

  if (input.overdue) {
    return "逾期未完成";
  }

  return "待完成";
}

function createMonthDays(date: string): Date[] {
  const [year, month] = date.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0).getDate();

  return Array.from({ length: end }, (_, index) => {
    const day = new Date(start);
    day.setDate(index + 1);
    return day;
  });
}

function normalizeMonth(inputDate: string, month?: string): string {
  return month ?? inputDate.slice(0, 7);
}

function filterVisibleHomeworksForDate(homeworks: Homework[], date: string): Homework[] {
  return getHomeworksForDate(homeworks, new Date(`${date}T00:00:00`)).filter((homework) => {
    if (!homework.repeat_end_date) {
      return true;
    }

    return formatDateKey(parseDateValue(homework.repeat_end_date)) >= date;
  });
}

function getReminderState(
  reminderStates: ParentReminderState[] | undefined,
  homeworkId: string,
  targetDate: string
): ParentReminderState | null {
  return (
    reminderStates?.find(
      (state) => state.homeworkId === homeworkId && state.targetDate === targetDate
    ) ?? null
  );
}

function buildChildDashboard(
  child: Child,
  homeworks: Homework[],
  checkIns: CheckIn[],
  date: string,
  reminderStates?: ParentReminderState[]
): ChildDashboardBuild {
  const visibleHomeworks = filterVisibleHomeworksForDate(homeworks, date);
  const dailyStatuses = buildDailyTaskStatuses(visibleHomeworks, checkIns, date);
  const statusByHomeworkId = new Map(
    dailyStatuses.map((status) => [status.homeworkId, status])
  );

  let completedCount = 0;
  let todayPoints = 0;
  let overdueCount = 0;
  let makeupCount = 0;

  const tasks = visibleHomeworks.map((homework) => {
    const status = statusByHomeworkId.get(homework.id);
    const completed = status?.completed ?? false;
    const late = status?.late ?? false;
    const overdue = !completed && isHomeworkOverdue(homework, date);

    if (completed) {
      completedCount += 1;
    }

    if (completed && late) {
      makeupCount += 1;
    }

    if (overdue) {
      overdueCount += 1;
    }

    todayPoints += status?.awardedPoints ?? 0;

    return {
      homeworkId: homework.id,
      title: homework.title,
      typeIcon: homework.type_icon,
      cutoffTime: homework.daily_cutoff_time,
      proofType: homework.required_checkpoint_type,
      statusText: getStatusText({ completed, late, overdue }),
      scored: status?.scored ?? false,
      awardedPoints: status?.awardedPoints ?? 0,
      reminderState: getReminderState(reminderStates, homework.id, date),
    };
  });

  const totalCount = tasks.length;
  const outstandingCount = totalCount - completedCount;

  const summary: ParentChildDashboardSummary = {
    childId: child.id,
    childName: child.name,
    avatar: child.avatar,
    completedCount,
    totalCount,
    todayPoints,
    overdueCount,
    makeupCount,
    outstandingCount,
    topNotice:
      overdueCount > 0
        ? `有 ${overdueCount} 项逾期`
        : outstandingCount > 0
          ? `还有 ${outstandingCount} 项待完成`
          : "今天全部完成",
  };

  return {
    summary,
    detail: {
      summary,
      tasks,
    },
  };
}

function buildCalendarDays(homeworks: Homework[], checkIns: CheckIn[], date: string) {
  return createMonthDays(date).map((day) => {
    const dayKey = formatDateKey(day);
    const statuses = buildDailyTaskStatuses(
      filterVisibleHomeworksForDate(homeworks, dayKey),
      checkIns,
      dayKey
    );
    const completedCount = statuses.filter((status) => status.completed).length;
    const lateCompletedCount = statuses.filter(
      (status) => status.completed && status.late
    ).length;
    const totalCount = statuses.length;

    return {
      date: dayKey,
      totalCount,
      completedCount,
      lateCompletedCount,
      outstandingCount: totalCount - completedCount,
      tooltip: {
        assignedCount: totalCount,
        completedCount,
        lateCompletedCount,
        pendingTitles: statuses
          .filter((status) => !status.completed)
          .map((status) => status.title),
      },
    };
  });
}

function buildMonthlyStats(
  homeworks: Homework[],
  checkIns: CheckIn[],
  month: string
): ParentMonthlyStats {
  const aggregation = createMonthDays(month).reduce<MonthlyAggregation>(
    (accumulator, day) => {
      const dayKey = formatDateKey(day);
      const statuses = buildDailyTaskStatuses(
        filterVisibleHomeworksForDate(homeworks, dayKey),
        checkIns,
        dayKey
      );
      const completedCount = statuses.filter((status) => status.completed).length;
      const onTimeCount = statuses.filter((status) => status.completed && !status.late).length;
      const totalPoints = statuses.reduce((sum, status) => sum + status.awardedPoints, 0);
      const lateCompletedCount = statuses.filter(
        (status) => status.completed && status.late
      ).length;

      accumulator.assignedCount += statuses.length;
      accumulator.completedCount += completedCount;
      accumulator.onTimeCount += onTimeCount;
      accumulator.totalPoints += totalPoints;
      if (lateCompletedCount > 0) {
        accumulator.makeupDays += 1;
      }

      return accumulator;
    },
    {
      assignedCount: 0,
      completedCount: 0,
      onTimeCount: 0,
      totalPoints: 0,
      makeupDays: 0,
    }
  );

  return {
    completionRate:
      aggregation.assignedCount === 0
        ? 0
        : aggregation.completedCount / aggregation.assignedCount,
    onTimeRate:
      aggregation.assignedCount === 0
        ? 0
        : aggregation.onTimeCount / aggregation.assignedCount,
    totalPoints: aggregation.totalPoints,
    makeupDays: aggregation.makeupDays,
  };
}

function buildCheckInHeatmap(
  checkIns: CheckIn[],
  month: string
): ParentCheckInHeatmapBucket[] {
  const counts = new Array<number>(24).fill(0);

  for (const checkIn of checkIns) {
    if (!checkIn.completed_at) {
      continue;
    }

    const completedMonth = formatDateKey(parseDateValue(checkIn.completed_at)).slice(0, 7);
    if (completedMonth !== month) {
      continue;
    }

    counts[new Date(checkIn.completed_at).getHours()] += 1;
  }

  return counts.map((count, hour) => ({ hour, count }));
}

function buildWeakestTypes(
  homeworks: Homework[],
  checkIns: CheckIn[],
  date: string
): ParentMonthlyInsight[] {
  const totals = new Map<string, { assignedCount: number; completedCount: number }>();

  for (const day of createMonthDays(date)) {
    const dayKey = formatDateKey(day);
    const statuses = buildDailyTaskStatuses(
      filterVisibleHomeworksForDate(homeworks, dayKey),
      checkIns,
      dayKey
    );

    for (const status of statuses) {
      const homework = homeworks.find((item) => item.id === status.homeworkId);
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
    .map(([typeName, item]) => ({
      typeName,
      assignedCount: item.assignedCount,
      completedCount: item.completedCount,
      completionRate:
        item.assignedCount === 0 ? 0 : item.completedCount / item.assignedCount,
    }))
    .sort((left, right) => {
      if (left.completionRate !== right.completionRate) {
        return left.completionRate - right.completionRate;
      }

      if (left.assignedCount !== right.assignedCount) {
        return left.assignedCount - right.assignedCount;
      }

      return left.typeName.localeCompare(right.typeName, "zh-CN");
    });
}

export function buildParentDashboard(
  input: ParentDashboardInput
): ParentMonthlyDashboard {
  const month = normalizeMonth(input.date, input.month);
  const byChild = new Map<string, { homeworks: Homework[]; checkIns: CheckIn[] }>();

  for (const child of input.children) {
    byChild.set(child.id, { homeworks: [], checkIns: [] });
  }

  for (const homework of input.homeworks) {
    const bucket = byChild.get(homework.child_id);
    if (bucket) {
      bucket.homeworks.push(homework);
    }
  }

  for (const checkIn of input.checkIns) {
    const bucket = byChild.get(checkIn.child_id);
    if (bucket) {
      bucket.checkIns.push(checkIn);
    }
  }

  const built = input.children.map((child) => {
    const bucket = byChild.get(child.id) ?? { homeworks: [], checkIns: [] };
    return buildChildDashboard(
      child,
      bucket.homeworks,
      bucket.checkIns,
      input.date,
      input.reminderStates
    );
  });

  built.sort((left, right) => {
    if (right.summary.overdueCount !== left.summary.overdueCount) {
      return right.summary.overdueCount - left.summary.overdueCount;
    }

    if (right.summary.outstandingCount !== left.summary.outstandingCount) {
      return right.summary.outstandingCount - left.summary.outstandingCount;
    }

    return left.summary.childName.localeCompare(right.summary.childName);
  });

  return {
    summaries: built.map((item) => item.summary),
    calendarDays: buildCalendarDays(input.homeworks, input.checkIns, month),
    selectedDayDetails: built.map((item) => item.detail),
    weakestTypes: buildWeakestTypes(input.homeworks, input.checkIns, month),
    monthlyStats: buildMonthlyStats(input.homeworks, input.checkIns, month),
    checkInHeatmap: buildCheckInHeatmap(input.checkIns, month),
  };
}

export function getDefaultSelectedChildId(
  summaries: ParentChildDashboardSummary[]
): string | null {
  return summaries[0]?.childId ?? null;
}

