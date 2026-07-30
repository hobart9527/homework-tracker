import type { Database } from "@/lib/supabase/types";
import { formatDateKey, getHomeworksForDate, parseDateValue } from "@/lib/homework-utils";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"] & {
  is_scored?: boolean;
  is_late?: boolean;
  awarded_points?: number;
};

export type ProofType = "photo" | "audio" | null;

export type LearningEventSource = {
  platform: "ixl" | "khan-academy" | "raz-kids" | "epic";
  title: string;
  occurredAt: string | null;
  durationMinutes: number | null;
};

export type DailyTaskStatus = {
  homeworkId: string;
  date: string;
  title: string;
  typeIcon: string | null;
  estimatedMinutes: number | null;
  pointValue: number;
  platformUrl: string | null;
  dailyCutoffTime: string | null;
  requiredCheckpointType: ProofType;
  completed: boolean;
  late: boolean;
  scored: boolean;
  awardedPoints: number;
  submissionCount: number;
  latestCheckInId: string | null;
  latestProofType: ProofType;
  /** Learning event that auto-completed this task; undefined for manual check-ins. */
  autoSource?: LearningEventSource | null;
};

/**
 * Maps check_in ids to the learning event that auto-completed them, via
 * homework_auto_matches.triggered_check_in_id.
 *
 * ponytail: single query per call, no cache. Add a request-level cache if
 * dashboards start fetching this on every keystroke.
 */
export async function loadAutoSourcesByCheckInId(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  checkInIds: string[];
}): Promise<Record<string, LearningEventSource>> {
  if (input.checkInIds.length === 0) {
    return {};
  }

  const { data, error } = await input.supabase
    .from("homework_auto_matches")
    .select(
      "triggered_check_in_id, learning_events(platform, title, occurred_at, duration_minutes)"
    )
    .in("triggered_check_in_id", input.checkInIds)
    .eq("is_primary", true);

  if (error || !data) {
    return {};
  }

  const result: Record<string, LearningEventSource> = {};

  for (const row of data as Array<{
    triggered_check_in_id: string | null;
    learning_events:
      | {
          platform: string;
          title: string;
          occurred_at: string | null;
          duration_minutes: number | null;
        }
      | null;
  }>) {
    if (!row.triggered_check_in_id || !row.learning_events) {
      continue;
    }

    result[row.triggered_check_in_id] = {
      platform: row.learning_events.platform as LearningEventSource["platform"],
      title: row.learning_events.title,
      occurredAt: row.learning_events.occurred_at,
      durationMinutes: row.learning_events.duration_minutes,
    };
  }

  return result;
}

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
  autoSourcesByCheckInId?: Record<string, LearningEventSource>,
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
      platformUrl: hw.platform_url ?? null,
      estimatedMinutes: hw.estimated_minutes,
      pointValue: hw.point_value ?? 0,
      dailyCutoffTime: hw.daily_cutoff_time,
      requiredCheckpointType: hw.required_checkpoint_type as "photo" | "audio" | null,
      completed: sameDay.length > 0,
      late: firstScored?.is_late ?? false,
      scored: Boolean(firstScored),
      awardedPoints: firstScored?.awarded_points ?? 0,
      submissionCount: sameDay.length,
      latestCheckInId: latestCheckIn?.id ?? null,
      latestProofType: (latestCheckIn?.proof_type ?? null) as "photo" | "audio" | null,
      autoSource:
        latestCheckIn?.id != null
          ? autoSourcesByCheckInId?.[latestCheckIn.id]
          : undefined,
    };
  });
}
