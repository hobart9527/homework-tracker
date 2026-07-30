type SupabaseInsertResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseMaybeSingleResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseLike = {
  from: (table: string) => {
    select?: (
      columns?: string
    ) => {
      eq: (
        column: string,
        value: string
      ) => {
        eq: (
          column: string,
          value: string
        ) => {
          maybeSingle: () => Promise<SupabaseMaybeSingleResult<Record<string, unknown>>>;
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

export async function createLearningEventReview(input: {
  supabase: SupabaseLike;
  learningEventId: string;
  reviewStatus: "unmatched" | "resolved";
  reviewReason: "no_candidate_homeworks" | "no_matching_homework";
  reviewSummary: Record<string, unknown>;
}) {
  const { data, error } = await input.supabase
    .from("learning_event_reviews")
    .insert({
      learning_event_id: input.learningEventId,
      review_status: input.reviewStatus,
      review_reason: input.reviewReason,
      review_summary: input.reviewSummary,
    })
    .select()
    .single();

  if (error?.message.includes("learning_event_reviews_learning_event_key")) {
    return {
      status: "duplicate" as const,
      review: null,
    };
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: "created" as const,
    review: data,
  };
}

/**
 * Records a learning_event_reviews row for the *existing* learning_event that
 * was hit by a duplicate ingest. The unique constraint on learning_events
 * swallowed the second insert so we don't have its id — we look it up by
 * source_ref + platform_account_id and write a review explaining the
 * suppression.
 *
 * Returns "duplicate" when the review row already exists for that event.
 * Returns "failed" for any other error so the caller can keep the pipeline
 * moving.
 */
export async function recordDuplicateSuppressedReview(input: {
  supabase: SupabaseLike;
  sourceRef: string;
  platformAccountId: string;
  occurredAt: string;
  title: string;
  subject: string | null;
  eventType: string;
  rawPayload: Record<string, unknown>;
}) {
  const sb = input.supabase;

  const { data: existing, error: lookupError } = await sb
    .from("learning_events")
    .select!("id")
    .eq("source_ref", input.sourceRef)
    .eq("platform_account_id", input.platformAccountId)
    .maybeSingle();

  if (lookupError) {
    return { status: "failed" as const, reason: lookupError.message };
  }

  if (!existing) {
    return {
      status: "failed" as const,
      reason: "no_existing_learning_event",
    };
  }

  const learningEventId = String((existing as { id: string }).id);

  return createLearningEventReview({
    supabase: sb,
    learningEventId,
    reviewStatus: "resolved",
    reviewReason: "no_matching_homework",
    reviewSummary: {
      ...input.rawPayload,
      suppressed: true,
      suppressionReason: "duplicate_source_ref",
      occurredAt: input.occurredAt,
      title: input.title,
      subject: input.subject,
      eventType: input.eventType,
    },
  });
}