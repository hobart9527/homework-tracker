import { getDateKeyInTimeZone } from "@/lib/learning-sync";
import type { Json } from "@/lib/supabase/types";

type SupabaseInsertResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseLike = {
  from: (table: string) => {
    select?: (columns?: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              eq: (column: string, value: string) => {
                maybeSingle: () => Promise<SupabaseInsertResult<Record<string, unknown>>>;
              };
            };
          };
        };
      };
    };
    update: (
      payload: Record<string, unknown>
    ) => {
      eq: (column: string, value: string) => {
        select: () => {
          single: () => Promise<SupabaseInsertResult<Record<string, unknown>>>;
        };
      };
    };
    insert: (
      payload: Record<string, unknown>
    ) => {
      select: () => {
        single: () => Promise<SupabaseInsertResult<Record<string, unknown>>>;
      };
    };
  };
};

export type LearningEventInput = {
  childId: string;
  platform: "ixl" | "khan-academy" | "raz-kids" | "epic";
  platformAccountId: string;
  occurredAt: string;
  eventType: string;
  title: string;
  subject: string | null;
  durationMinutes: number | null;
  score: number | null;
  completionState: string | null;
  sourceRef: string;
  rawPayload: Json;
};

function getSessionIdFromRawPayload(rawPayload: Json) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  return typeof rawPayload.sessionId === "string" ? rawPayload.sessionId : null;
}

function getSessionIdsFromRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return [];
  }

  const payload = rawPayload as Record<string, unknown>;
  if (Array.isArray(payload.sessionIds)) {
    return payload.sessionIds.filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
  }

  if (typeof payload.sessionId === "string" && payload.sessionId.length > 0) {
    return [payload.sessionId];
  }

  return [];
}

function withInitialSessionIds(rawPayload: Json) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return rawPayload;
  }

  const sessionId = getSessionIdFromRawPayload(rawPayload);
  if (!sessionId) {
    return rawPayload;
  }

  return {
    ...rawPayload,
    sessionIds: [sessionId],
  };
}

export async function ingestLearningEvent(input: {
  supabase: SupabaseLike;
  householdTimeZone: string;
  event: LearningEventInput;
}) {
  const localDateKey = getDateKeyInTimeZone(
    input.event.occurredAt,
    input.householdTimeZone
  );
  const sessionId = getSessionIdFromRawPayload(input.event.rawPayload);

  if (input.event.platform === "ixl" && input.event.subject) {
    const existingLookup = await input.supabase
      .from("learning_events")
      .select?.("id, duration_minutes, raw_payload")
      .eq("platform_account_id", input.event.platformAccountId)
      .eq("local_date_key", localDateKey)
      .eq("event_type", input.event.eventType)
      .eq("title", input.event.title)
      .eq("subject", input.event.subject)
      .maybeSingle();

    if (existingLookup?.error) {
      throw new Error(existingLookup.error.message);
    }

    if (existingLookup?.data) {
      const knownSessionIds = getSessionIdsFromRawPayload(
        existingLookup.data.raw_payload
      );

      if (sessionId && knownSessionIds.includes(sessionId)) {
        return {
          status: "duplicate" as const,
          localDateKey,
          event: existingLookup.data,
        };
      }

      const mergedSessionIds = sessionId
        ? Array.from(new Set([...knownSessionIds, sessionId]))
        : knownSessionIds;
      const mergedRawPayload =
        input.event.rawPayload &&
        typeof input.event.rawPayload === "object" &&
        !Array.isArray(input.event.rawPayload)
          ? {
              ...input.event.rawPayload,
              sessionIds: mergedSessionIds,
            }
          : input.event.rawPayload;

      const { data, error } = await input.supabase
        .from("learning_events")
        .update({
          duration_minutes:
            (Number(existingLookup.data.duration_minutes ?? 0) || 0) +
            (input.event.durationMinutes ?? 0),
          score: input.event.score,
          raw_payload: mergedRawPayload,
        })
        .eq("id", String(existingLookup.data.id))
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return {
        status: "merged" as const,
        localDateKey,
        event: data,
      };
    }
  }

  const { data, error } = await input.supabase
    .from("learning_events")
    .insert({
      child_id: input.event.childId,
      platform: input.event.platform,
      platform_account_id: input.event.platformAccountId,
      occurred_at: input.event.occurredAt,
      event_type: input.event.eventType,
      title: input.event.title,
      subject: input.event.subject,
      duration_minutes: input.event.durationMinutes,
      score: input.event.score,
      completion_state: input.event.completionState,
      source_ref: input.event.sourceRef,
      raw_payload: withInitialSessionIds(input.event.rawPayload),
      local_date_key: localDateKey,
    })
    .select()
    .single();

  if (error?.message.includes("learning_events_account_source_key")) {
    return {
      status: "duplicate" as const,
      localDateKey,
      event: null,
    };
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: "inserted" as const,
    localDateKey,
    event: data,
  };
}
