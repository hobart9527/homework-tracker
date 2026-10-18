import {
  loadAutoCheckinContext,
  syncLearningEventAutoCheckins,
} from "@/lib/learning-event-auto-checkins";
import { getDateKeyInTimeZone } from "@/lib/learning-sync";
import { normalizeIxlLearningEvent } from "@/lib/platform-adapters/ixl";
import type { LearningEventInput } from "@/lib/learning-events";

/**
 * Bridge for scripts/sync-ixl.mjs (GHA) into the TypeScript auto-checkin
 * pipeline. Loaded from the .mjs script via `tsx/esm/api` tsImport.
 *
 * Runs the full chain: ingestLearningEvent (with the
 * learning_events_account_source_key dedup) → homework auto-match →
 * check_ins / homework_auto_matches / learning_event_reviews writes.
 */

export type NormalizedIxlActivity = {
  occurredAt: string;
  skillId: string;
  skillName: string;
  subject?: string | null;
  scorePercent?: number | null;
  durationSeconds?: number | null;
  sessionId?: string | null;
};

export function buildIxlLearningEvent(input: {
  childId: string;
  platformAccountId: string;
  activity: NormalizedIxlActivity;
}): LearningEventInput {
  const normalized = normalizeIxlLearningEvent({
    occurredAt: input.activity.occurredAt,
    skillId: input.activity.skillId,
    skillName: input.activity.skillName,
    subject: input.activity.subject ?? null,
    scorePercent: input.activity.scorePercent ?? null,
    durationSeconds: input.activity.durationSeconds ?? null,
    sessionId: input.activity.sessionId ?? null,
  });

  return {
    childId: input.childId,
    platform: "ixl",
    platformAccountId: input.platformAccountId,
    occurredAt: normalized.occurredAt,
    eventType: normalized.eventType,
    title: normalized.title,
    subject: normalized.subject,
    durationMinutes: normalized.durationMinutes,
    score: normalized.score,
    completionState: normalized.completionState,
    sourceRef: normalized.sourceRef,
    rawPayload: normalized.rawPayload,
  };
}

export async function runIxlEventPipeline(input: {
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
