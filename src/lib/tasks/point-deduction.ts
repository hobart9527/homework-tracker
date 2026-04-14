import type { Database } from "@/lib/supabase/types";
import { formatDateKey, isAfterCutoff } from "@/lib/homework-utils";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];

export type PointDeductionResult = {
  homeworkId: string;
  childId: string;
  homeworkTitle: string;
  childName: string;
  deduction: number;
  date: string;
};

export type DailyPointDeductionSummary = {
  date: string;
  deductions: PointDeductionResult[];
  totalDeducted: number;
};

/**
 * Find homeworks that were not completed by cutoff time on a given date.
 * Only considers homeworks with point_deduction > 0.
 */
export function findUncompletedHomeworksByCutoff(
  homeworks: Homework[],
  checkIns: CheckIn[],
  child: Child,
  date: Date,
  now: Date
): Homework[] {
  const dateKey = formatDateKey(date);
  const cutoffTime = "20:00"; // default cutoff

  // Get all check-ins for this child on this date
  const checkInsOnDate = checkIns.filter((checkIn) => {
    if (checkIn.child_id !== child.id) return false;
    const checkInDate = formatDateKey(new Date(checkIn.completed_at || ""));
    return checkInDate === dateKey;
  });

  // Get homeworks scheduled for this date that have point_deduction configured
  return homeworks.filter((homework) => {
    if (homework.child_id !== child.id) return false;
    if (homework.point_deduction == null || homework.point_deduction <= 0) return false;
    if (!homework.is_active) return false;

    // Check if homework was scheduled for this date (simplified - daily homeworks apply every day)
    const isScheduledForDate = isHomeworkScheduledForDate(homework, date);
    if (!isScheduledForDate) return false;

    // Check if already completed (has a scored check-in)
    const hasScoredCheckIn = checkInsOnDate.some(
      (checkIn) =>
        checkIn.homework_id === homework.id &&
        checkIn.is_scored === true
    );
    if (hasScoredCheckIn) return false;

    // Check if past cutoff
    if (!isAfterCutoff(homework.daily_cutoff_time || cutoffTime, now)) return false;

    return true;
  });
}

function isHomeworkScheduledForDate(homework: Homework, date: Date): boolean {
  const dateKey = formatDateKey(date);
  const dayOfWeek = date.getDay();

  switch (homework.repeat_type) {
    case "daily":
      // Check if within date range
      if (homework.repeat_start_date) {
        const startDate = new Date(homework.repeat_start_date);
        if (date < startDate) return false;
      }
      if (homework.repeat_end_date) {
        const endDate = new Date(homework.repeat_end_date);
        if (date > endDate) return false;
      }
      return true;

    case "weekly":
      // Check if this day of week is in repeat_days
      return homework.repeat_days?.includes(dayOfWeek) ?? false;

    case "interval":
      // Check if days since start matches interval
      if (!homework.repeat_start_date) return false;
      const startDate = new Date(homework.repeat_start_date);
      const diffTime = Math.abs(date.getTime() - startDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays % (homework.repeat_interval || 1) === 0;

    case "once":
      // Check if this is the exact date
      return formatDateKey(date) === homework.repeat_start_date;

    default:
      return false;
  }
}

/**
 * Process point deductions for all children on a given date.
 * Returns the summary of all deductions made.
 */
export function calculatePointDeductions(
  homeworks: Homework[],
  checkIns: CheckIn[],
  children: Child[],
  date: Date,
  now: Date
): DailyPointDeductionSummary {
  const dateKey = formatDateKey(date);
  const deductions: PointDeductionResult[] = [];
  let totalDeducted = 0;

  for (const child of children) {
    const uncompletedHomeworks = findUncompletedHomeworksByCutoff(
      homeworks,
      checkIns,
      child,
      date,
      now
    );

    for (const homework of uncompletedHomeworks) {
      const deduction = homework.point_deduction || 0;
      if (deduction > 0) {
        deductions.push({
          homeworkId: homework.id,
          childId: child.id,
          homeworkTitle: homework.title,
          childName: child.name,
          deduction,
          date: dateKey,
        });
        totalDeducted += deduction;
      }
    }
  }

  return {
    date: dateKey,
    deductions,
    totalDeducted,
  };
}