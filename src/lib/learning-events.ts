import { getDateKeyInTimeZone } from "@/lib/learning-sync";
import type { Json } from "@/lib/supabase/types";

type SupabaseInsertResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseLike = {
  from: (table: string) => {
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

export async function ingestLearningEvent(input: {
  supabase: SupabaseLike;
  householdTimeZone: string;
  event: LearningEventInput;
}) {
  const localDateKey = getDateKeyInTimeZone(
    input.event.occurredAt,
    input.householdTimeZone
  );

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
      raw_payload: input.event.rawPayload,
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
