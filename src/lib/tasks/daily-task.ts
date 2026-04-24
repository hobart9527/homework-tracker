import type { Database } from "@/lib/supabase/types";
import { formatDateKey, getHomeworksForDate, parseDateValue } from "@/lib/homework-utils";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"] & {
  is_scored?: boolean;
  is_late?: boolean;
  awarded_points?: number;
};

export type ProofType = "photo" | "audio" | null;

export type DailyTaskStatus = {
  homeworkId: string;
  date: string;
  title: string;
  typeIcon: string | null;
  estimatedMinutes: number | null;
  pointValue: number;
  dailyCutoffTime: string | null;
  requiredCheckpointType: ProofType;
  completed: boolean;
  late: boolean;
  scored: boolean;
  awardedPoints: number;
  submissionCount: number;
  latestCheckInId: string | null;
  latestProofType: ProofType;
};

function isCheckInOnDate(checkIn: Pick<CheckIn, "completed_at">, date: string) {
  if (!checkIn.completed_at) {
    return false;
  }

  return formatDateKey(parseDateValue(checkIn.completed_at)) === date;
}

export function buildDailyTaskStatuses(
  homeworks: Homework[],
  checkIns: CheckIn[],
  date: string,
): DailyTaskStatus[] {
  const visibleHomeworks = getHomeworksForDate(homeworks, new Date(`${date}T00:00:00`));

  return visibleHomeworks.map((hw) => {
    const sameDay = checkIns.filter(
      (ci) => ci.homework_id === hw.id && isCheckInOnDate(ci, date)
    );
    const firstScored = sameDay.find((ci) => ci.is_scored);
    const latestCheckIn = [...sameDay].sort((left, right) => {
      const leftValue = parseDateValue(left.completed_at ?? left.created_at ?? "").getTime();
      const rightValue = parseDateValue(right.completed_at ?? right.created_at ?? "").getTime();
      return rightValue - leftValue;
    })[0];

    return {
      homeworkId: hw.id,
      date,
      title: hw.title,
      typeIcon: hw.type_icon,
      estimatedMinutes: hw.estimated_minutes,
      pointValue: hw.point_value ?? 0,
      dailyCutoffTime: hw.daily_cutoff_time,
      requiredCheckpointType: hw.required_checkpoint_type,
      completed: sameDay.length > 0,
      late: firstScored?.is_late ?? false,
      scored: Boolean(firstScored),
      awardedPoints: firstScored?.awarded_points ?? 0,
      submissionCount: sameDay.length,
      latestCheckInId: latestCheckIn?.id ?? null,
      latestProofType: latestCheckIn?.proof_type ?? null,
    };
  });
}
