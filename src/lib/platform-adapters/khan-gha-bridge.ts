import {
  loadAutoCheckinContext,
  syncLearningEventAutoCheckins,
} from "@/lib/learning-event-auto-checkins";
import { getDateKeyInTimeZone } from "@/lib/learning-sync";
import { normalizeKhanLearningEvent } from "@/lib/platform-adapters/khan-academy";
import type { LearningEventInput } from "@/lib/learning-events";

/**
 * Bridge for scripts/sync-khan.mjs (GHA) into the TypeScript auto-checkin
 * pipeline. Loaded from the .mjs script via `tsx/esm/api` tsImport.
 *
 * Runs the full chain: ingestLearningEvent (with the
 * learning_events_account_source_key dedup) → homework auto-match →
 * check_ins / homework_auto_matches / learning_event_reviews writes.
 */

export type NormalizedKhanActivity = {
  id: string;
  title: string;
  subtitle: string | null;
  durationMinutes: number | null;
  eventTimestamp: string | null;
  courseName?: string | null;
  masteryLevel?: string | null;
  progressPercent?: number | null;
  durationSeconds?: number | null;
};

export function buildKhanLearningEvent(input: {
  childId: string;
  platformAccountId: string;
  activity: NormalizedKhanActivity;
}): LearningEventInput {
  const occurredAt = input.activity.eventTimestamp
    ? new Date(input.activity.eventTimestamp).toISOString()
    : new Date().toISOString();

  const normalized = normalizeKhanLearningEvent({
    occurredAt,
    lessonId: input.activity.id,
    lessonTitle: input.activity.title,
    courseName: input.activity.courseName ?? input.activity.subtitle ?? null,
    masteryLevel: input.activity.masteryLevel ?? null,
    progressPercent: input.activity.progressPercent ?? null,
    durationSeconds: input.activity.durationSeconds ?? null,
  });

  return {
    childId: input.childId,
    platform: "khan-academy",
    platformAccountId: input.platformAccountId,
    occurredAt,
    eventType: normalized.eventType,
    title: normalized.title,
    subject: normalized.subject,
    durationMinutes: normalized.durationMinutes,
    score: normalized.score,
    completionState: normalized.completionState,
    sourceRef: normalized.sourceRef,
    rawPayload: {
      ...input.activity,
      lessonId: input.activity.id,
      lessonTitle: input.activity.title,
      courseName: input.activity.courseName ?? null,
      masteryLevel: input.activity.masteryLevel ?? null,
      progressPercent: input.activity.progressPercent ?? null,
      durationSeconds: input.activity.durationSeconds ?? null,
    },
  };
}

export async function runKhanEventPipeline(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  householdTimeZone: string;
  event: LearningEventInput;
}) {
  const localDateKey = getDateKeyInTimeZone(
    input.event.occurredAt,
    input.householdTimeZone
  );

  const context = await loadAutoCheckinContext({
    supabase: input.supabase,
    childId: input.event.childId,
    localDateKey,
  });

  const result = await syncLearningEventAutoCheckins({
    supabase: input.supabase,
    householdTimeZone: input.householdTimeZone,
    event: input.event,
    candidateHomeworks: context.candidateHomeworks,
    existingCheckInsByHomeworkId: context.existingCheckInsByHomeworkId,
    groupNamesById: context.groupNamesById,
    typeBindingsById: context.typeBindingsById,
    subjectMappings: context.subjectMappings,
  });

  // Titles for GHA log output only.
  let matchedTitles: string[] = [];
  if (result.homeworkResults.length > 0) {
    const { data } = await input.supabase
      .from("homeworks")
      .select("id, title")
      .in(
        "id",
        result.homeworkResults.map((item) => item.homeworkId)
      );
    matchedTitles = ((data ?? []) as Array<{ title: string }>).map((row) =>
      String(row.title)
    );
  }

  return { ...result, matchedTitles };
}