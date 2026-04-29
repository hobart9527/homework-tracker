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
