import { applyAutoCheckinMatches } from "@/lib/auto-checkins";
import {
  createLearningEventReview,
  recordDuplicateSuppressedReview,
} from "@/lib/learning-event-reviews";
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
  matchesTypePlatformBinding,
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
  | "type_id"
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
  | "type_group_id"
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

  // Use (supabase as any) to avoid unbinding .select from its builder context.
  // Extracting .select as an unbound property causes 'Cannot read properties of
  // undefined (reading 'cloneRequestState')' in @supabase/postgrest-js.
  const sb = input.supabase as any;

  const { data: homeworks, error: homeworkError } = await sb
    .from("homeworks")
    .select("*")
    .eq("child_id", input.childId)
    .eq("is_active", true);

  if (homeworkError) {
    throw new Error(homeworkError.message);
  }

  const { data: checkIns, error: checkInError } = await sb
    .from("check_ins")
    .select("id, homework_id")
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
    type_id: homework.type_id,
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
    type_group_id: homework.type_group_id,
  }));

  // Fetch group names for platform matching hints
  const groupIds = [...new Set(candidateHomeworks.map((h) => h.type_group_id).filter(Boolean))];
  let groupNamesById: Record<string, string> = {};
  if (groupIds.length > 0) {
    const { data: groupsData } = await sb
      .from("homework_type_groups")
      .select("id, name")
      .in("id", groupIds as string[]);
    groupNamesById = Object.fromEntries(
      (groupsData ?? []).map((g: any) => [String(g.id), String(g.name)])
    );
  }

  // Fetch type bindings for all candidate homework types
  const typeIds = [...new Set(candidateHomeworks.map((h) => h.type_id).filter(Boolean))];
  let typeBindingsById: Record<string, { allowed_platforms: string[]; match_keywords: string[] }> = {};
  if (typeIds.length > 0) {
    const { data: bindingsData } = await sb
      .from("homework_type_bindings")
      .select("type_id, allowed_platforms, match_keywords")
      .in("type_id", typeIds as string[]);
    typeBindingsById = Object.fromEntries(
      (bindingsData ?? []).map((b: any) => [
        String(b.type_id),
        { allowed_platforms: (b.allowed_platforms as string[]) || [], match_keywords: (b.match_keywords as string[]) || [] },
      ])
    );
  }

  // Fetch all subject mappings (small table, ~9 rows)
  const { data: allMappingsData } = await sb
    .from("platform_subject_mappings")
    .select("platform, platform_subject, type_id, confidence");
  const subjectMappings: Array<{ platform: string; platform_subject: string; type_id: string; confidence: number }> =
    (allMappingsData ?? []).map((m: any) => ({
      platform: String(m.platform),
      platform_subject: String(m.platform_subject),
      type_id: String(m.type_id),
      confidence: Number(m.confidence),
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
    groupNamesById,
    typeBindingsById,
    subjectMappings,
  };
}

export async function syncLearningEventAutoCheckins(input: {
  supabase: SupabaseLike;
  householdTimeZone: string;
  event: LearningEventInput;
  candidateHomeworks: CandidateHomework[];
  existingCheckInsByHomeworkId: Record<string, { id: string } | null>;
  groupNamesById?: Record<string, string>;
  typeBindingsById?: Record<string, { allowed_platforms: string[]; match_keywords: string[] }>;
  subjectMappings?: Array<{ platform: string; platform_subject: string; type_id: string; confidence: number }>;
}) {
  const ingestResult = await ingestLearningEvent({
    supabase: input.supabase as any,
    householdTimeZone: input.householdTimeZone,
    event: input.event,
  });

  if (ingestResult.status === "duplicate" || !ingestResult.event) {
    // The unique constraint on learning_events swallowed this insert.
    // Write a learning_event_reviews row explaining the suppression so we
    // don't lose the audit trail.
    try {
      await recordDuplicateSuppressedReview({
        supabase: input.supabase as any,
        sourceRef: input.event.sourceRef,
        platformAccountId: input.event.platformAccountId,
        occurredAt: input.event.occurredAt,
        title: input.event.title,
        subject: input.event.subject,
        eventType: input.event.eventType,
        rawPayload:
          input.event.rawPayload && typeof input.event.rawPayload === "object" && !Array.isArray(input.event.rawPayload)
            ? (input.event.rawPayload as Record<string, unknown>)
            : {},
      });
    } catch (reviewErr) {
      // Best-effort — never block on the review write.
      console.warn("[auto-checkins] failed to record duplicate review", reviewErr);
    }

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
    const typeBinding = input.typeBindingsById?.[homework.type_id || ""];

    // Check if event platform is allowed for this homework type
    if (!matchesTypePlatformBinding({
      eventPlatform: input.event.platform,
      homeworkTypeId: homework.type_id,
      homeworkTypeBinding: typeBinding,
    })) {
      continue;
    }

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

    const homeworkGroupName = homework.type_group_id
      ? input.groupNamesById?.[homework.type_group_id]
      : undefined;

    if (
      !matchesDirectBinding &&
      !matchesPlatformHomeworkType({
        platform: input.event.platform,
        subject: input.event.subject,
        title: input.event.title,
        homeworkTypeName: homework.type_name,
        homeworkGroupName,
        homeworkTypeId: homework.type_id,
        subjectMappings: input.subjectMappings,
        typeBinding,
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
      homework: homework as {
        id: string;
        child_id: string;
        point_value: number | null;
        estimated_minutes: number | null;
        required_checkpoint_type: "photo" | "audio" | null;
      },
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