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
  }>;
};

export type ParentCalendarDay = {
  date: string;
  totalCount: number;
  completedCount: number;
  lateCompletedCount: number;
  outstandingCount: number;
};

export type ParentMonthlyInsight = {
  typeName: string;
  assignedCount: number;
  completedCount: number;
  completionRate: number;
};

export type ParentMonthlyDashboard = {
  summaries: ParentChildDashboardSummary[];
  calendarDays: ParentCalendarDay[];
  selectedDayDetails: ParentChildDashboardDetail[];
  weakestTypes: ParentMonthlyInsight[];
};

type ParentDashboardInput = {
  children: Child[];
  homeworks: Homework[];
  checkIns: CheckIn[];
  date: string;
};

type ChildDashboardBuild = {
  summary: ParentChildDashboardSummary;
  detail: ParentChildDashboardDetail;
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

function buildChildDashboard(
  child: Child,
  homeworks: Homework[],
  checkIns: CheckIn[],
  date: string
): ChildDashboardBuild {
  const dayDate = new Date(`${date}T00:00:00`);
  const visibleHomeworks = getHomeworksForDate(homeworks, dayDate);
  const dailyStatuses = buildDailyTaskStatuses(homeworks, checkIns, date);
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
    const statuses = buildDailyTaskStatuses(homeworks, checkIns, dayKey);
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
    };
  });
}

function buildWeakestTypes(
  homeworks: Homework[],
  checkIns: CheckIn[],
  date: string
): ParentMonthlyInsight[] {
  const totals = new Map<string, { assignedCount: number; completedCount: number }>();

  for (const day of createMonthDays(date)) {
    const dayKey = formatDateKey(day);
    const statuses = buildDailyTaskStatuses(homeworks, checkIns, dayKey);

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
    return buildChildDashboard(child, bucket.homeworks, bucket.checkIns, input.date);
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
    calendarDays: buildCalendarDays(input.homeworks, input.checkIns, input.date),
    selectedDayDetails: built.map((item) => item.detail),
    weakestTypes: buildWeakestTypes(input.homeworks, input.checkIns, input.date),
  };
}

export function getDefaultSelectedChildId(
  summaries: ParentChildDashboardSummary[]
): string | null {
  return summaries[0]?.childId ?? null;
}
