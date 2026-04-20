import { applyAutoCheckinMatches } from "@/lib/auto-checkins";
import { createLearningEventReview } from "@/lib/learning-event-reviews";
import {
  getHomeworksForDate,
  getLocalDayBounds,
} from "@/lib/homework-utils";
import {
  ingestLearningEvent,
  type LearningEventInput,
} from "@/lib/learning-events";
import {
  matchesDirectPlatformBinding,
  matchesPlatformHomeworkType,
} from "@/lib/learning-sync";
import type { Database } from "@/lib/supabase/types";

type SupabaseInsertResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseLike = {
  from: (table: string) => {
    insert?: (
      payload: Record<string, unknown>
    ) => {
      select: () => {
        single: () => Promise<SupabaseInsertResult<Record<string, unknown>>>;
      };
    };
    select?: (
      columns?: string
    ) => {
      eq: (column: string, value: string) => Promise<{
        data: Record<string, unknown>[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

type CandidateHomework = Pick<
  Database["public"]["Tables"]["homeworks"]["Row"],
  | "id"
  | "child_id"
  | "type_name"
  | "point_value"
  | "estimated_minutes"
  | "required_checkpoint_type"
  | "platform_binding_platform"
  | "platform_binding_source_ref"
  | "repeat_type"
  | "repeat_days"
  | "repeat_interval"
  | "repeat_start_date"
  | "repeat_end_date"
  | "is_active"
>;

type ExistingCheckIn = Pick<
  Database["public"]["Tables"]["check_ins"]["Row"],
  "id" | "homework_id"
>;

export async function loadAutoCheckinContext(input: {
  supabase: SupabaseLike;
  childId: string;
  localDateKey: string;
}) {
  const [year, month, day] = input.localDateKey.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  const { start, end } = getLocalDayBounds(localDate);

  const homeworksSelect = input.supabase.from("homeworks")
    .select as unknown as (columns?: string) => {
    eq: (column: string, value: string) => Promise<{
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    }>;
  };

  const { data: homeworks, error: homeworkError } = await homeworksSelect("*").eq(
    "child_id",
    input.childId
  );

  if (homeworkError) {
    throw new Error(homeworkError.message);
  }

  const checkInsSelect = input.supabase.from("check_ins")
    .select as unknown as (columns?: string) => {
    eq: (column: string, value: string) => {
      gte: (column: string, value: string) => {
        lte: (column: string, value: string) => Promise<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data: checkIns, error: checkInError } = await checkInsSelect(
    "id, homework_id"
  )
    .eq("child_id", input.childId)
    .gte("completed_at", start)
    .lte("completed_at", end);

  if (checkInError) {
    throw new Error(checkInError.message);
  }

  const candidateHomeworks = getHomeworksForDate(
    (homeworks ?? []) as Database["public"]["Tables"]["homeworks"]["Row"][],
    localDate
  ).map((homework) => ({
    id: homework.id,
    child_id: homework.child_id,
    type_name: homework.type_name,
    point_value: homework.point_value,
    estimated_minutes: homework.estimated_minutes,
    required_checkpoint_type: homework.required_checkpoint_type,
    platform_binding_platform: homework.platform_binding_platform,
    platform_binding_source_ref: homework.platform_binding_source_ref,
    repeat_type: homework.repeat_type,
    repeat_days: homework.repeat_days,
    repeat_interval: homework.repeat_interval,
    repeat_start_date: homework.repeat_start_date,
    repeat_end_date: homework.repeat_end_date,
    is_active: homework.is_active,
  }));

  const existingCheckInsByHomeworkId = Object.fromEntries(
    ((checkIns ?? []) as ExistingCheckIn[]).map((checkIn) => [
      checkIn.homework_id,
      { id: checkIn.id },
    ])
  );

  return {
    candidateHomeworks,
    existingCheckInsByHomeworkId,
  };
}

export async function syncLearningEventAutoCheckins(input: {
  supabase: SupabaseLike;
  householdTimeZone: string;
  event: LearningEventInput;
  candidateHomeworks: CandidateHomework[];
  existingCheckInsByHomeworkId: Record<string, { id: string } | null>;
}) {
  const ingestResult = await ingestLearningEvent({
    supabase: input.supabase as any,
    householdTimeZone: input.householdTimeZone,
    event: input.event,
  });

  if (ingestResult.status === "duplicate" || !ingestResult.event) {
    return {
      ingestStatus: ingestResult.status,
      learningEventId: null,
      localDateKey: ingestResult.localDateKey,
      homeworkResults: [],
      reviewStatus: null,
    };
  }

  const homeworkResults = [];
  const hasAnyDirectBindingMatch = input.candidateHomeworks.some((homework) =>
    matchesDirectPlatformBinding({
      eventPlatform: input.event.platform,
      eventSourceRef: input.event.sourceRef,
      homeworkBindingPlatform: homework.platform_binding_platform,
      homeworkBindingSourceRef: homework.platform_binding_source_ref,
    })
  );

  for (const homework of input.candidateHomeworks) {
    const hasDirectBinding =
      !!homework.platform_binding_platform &&
      !!homework.platform_binding_source_ref;
    const matchesDirectBinding = matchesDirectPlatformBinding({
      eventPlatform: input.event.platform,
      eventSourceRef: input.event.sourceRef,
      homeworkBindingPlatform: homework.platform_binding_platform,
      homeworkBindingSourceRef: homework.platform_binding_source_ref,
    });

    if (hasDirectBinding && !matchesDirectBinding) {
      continue;
    }

    if (hasAnyDirectBindingMatch && !matchesDirectBinding) {
      continue;
    }

    if (
      !matchesDirectBinding &&
      !matchesPlatformHomeworkType({
        platform: input.event.platform,
        subject: input.event.subject,
        title: input.event.title,
        homeworkTypeName: homework.type_name,
      })
    ) {
      continue;
    }

    const durationMinutes = input.event.durationMinutes ?? 0;
    const requiredMinutes = homework.estimated_minutes ?? 0;
    const usesCompletionStateThreshold =
      requiredMinutes <= 0 && !!input.event.completionState;
    const hasDurationMatch =
      durationMinutes > 0 && durationMinutes >= requiredMinutes;

    if (!hasDurationMatch && !usesCompletionStateThreshold) {
      continue;
    }

    const matchRule = hasDurationMatch
      ? matchesDirectBinding
        ? "direct_platform_task_binding"
        : "duration_threshold"
      : "completion_state";

    const result = await applyAutoCheckinMatches({
      supabase: input.supabase as any,
      childId: input.event.childId,
      homework,
      matches: [
        {
          learningEventId: String(ingestResult.event.id),
          matchedAt: input.event.occurredAt,
          matchRule,
          durationMinutes: input.event.durationMinutes,
          completionState: input.event.completionState,
        },
      ],
      existingCheckIn: input.existingCheckInsByHomeworkId[homework.id] ?? null,
    });

    if (result.decision === "unmatched") {
      continue;
    }

    homeworkResults.push({
      homeworkId: homework.id,
      decision: result.decision,
      createdCheckInId: result.createdCheckInId,
    });
  }

  let reviewStatus: "unmatched" | null = null;

  if (homeworkResults.length === 0) {
    await createLearningEventReview({
      supabase: input.supabase as any,
      learningEventId: String(ingestResult.event.id),
      reviewStatus: "unmatched",
      reviewReason:
        input.candidateHomeworks.length === 0
          ? "no_candidate_homeworks"
          : "no_matching_homework",
      reviewSummary: {
        childId: input.event.childId,
        platform: input.event.platform,
        localDateKey: ingestResult.localDateKey,
        candidateHomeworkCount: input.candidateHomeworks.length,
        durationMinutes: input.event.durationMinutes,
      },
    });
    reviewStatus = "unmatched";
  }

  return {
    ingestStatus: ingestResult.status,
    learningEventId: String(ingestResult.event.id),
    localDateKey: ingestResult.localDateKey,
    homeworkResults,
    reviewStatus,
  };
}
