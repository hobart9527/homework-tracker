import {
  resolveAutoCheckinDecision,
  selectPrimaryHomeworkMatch,
} from "@/lib/learning-sync";

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
  };
};

type HomeworkLike = {
  id: string;
  child_id: string;
  point_value: number | null;
  estimated_minutes: number | null;
  required_checkpoint_type: "photo" | "audio" | null;
};

type MatchCandidate = {
  learningEventId: string;
  matchedAt: string;
  matchRule: string;
  durationMinutes: number | null;
  completionState?: string | null;
};

export async function applyAutoCheckinMatches(input: {
  supabase: SupabaseLike;
  childId: string;
  homework: HomeworkLike;
  matches: MatchCandidate[];
  existingCheckIn: { id: string } | null;
}) {
  const sortedMatches = [...input.matches].sort((left, right) => {
    return (
      new Date(left.matchedAt).getTime() - new Date(right.matchedAt).getTime()
    );
  });
  const primaryMatch = selectPrimaryHomeworkMatch(sortedMatches);

  if (!primaryMatch) {
    return {
      decision: "unmatched" as const,
      createdCheckInId: null,
      primaryLearningEventId: null,
    };
  }

  const baseDecision = resolveAutoCheckinDecision({
    requiredMinutes: input.homework.estimated_minutes,
    requiredCheckpointType: input.homework.required_checkpoint_type,
    durationMinutes:
      sortedMatches.find(
        (match) => match.learningEventId === primaryMatch.learningEventId
      )?.durationMinutes ?? null,
    completionState:
      sortedMatches.find(
        (match) => match.learningEventId === primaryMatch.learningEventId
      )?.completionState ?? null,
  });

  const decision = input.existingCheckIn
    ? ("already_completed" as const)
    : baseDecision;

  let createdCheckInId: string | null = null;

  if (decision === "auto_completed") {
    const { data, error } = await input.supabase
      .from("check_ins")
      .insert!({
        homework_id: input.homework.id,
        child_id: input.childId,
        completed_at: primaryMatch.matchedAt,
        submitted_at: primaryMatch.matchedAt,
        points_earned: input.homework.point_value ?? 0,
        awarded_points: input.homework.point_value ?? 0,
        is_scored: true,
        is_late: false,
        proof_type: null,
        note: "Auto-completed from synced learning activity",
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Failed to create auto check-in");
    }

    createdCheckInId = String(data.id);
  }

  for (const match of sortedMatches) {
    const isPrimary = match.learningEventId === primaryMatch.learningEventId;
    const matchResult = isPrimary
      ? decision
      : "supporting_evidence";

    const { error } = await input.supabase
      .from("homework_auto_matches")
      .insert!({
        homework_id: input.homework.id,
        learning_event_id: match.learningEventId,
        match_rule: match.matchRule,
        match_result: matchResult,
        is_primary: isPrimary,
        triggered_check_in_id: isPrimary
          ? createdCheckInId ?? input.existingCheckIn?.id ?? null
          : null,
        matched_at: match.matchedAt,
      })
      .select()
      .single();

    if (
      error?.message.includes(
        "homework_auto_matches_homework_event_key"
      )
    ) {
      continue;
    }

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    decision,
    createdCheckInId,
    primaryLearningEventId: primaryMatch.learningEventId,
  };
}

/* ── Reading auto-checkin ── */

/**
 * Returns true when a reading homework qualifies for auto-completion:
 * type_name is "阅读" AND required_checkpoint_type is empty-string or
 * null (i.e. NOT "audio" recording mode).
 *
 * The caller is responsible for filtering by primary category (中文/英文)
 * via the homework_type_groups join.
 */
export function shouldAutoCompleteReading(homework: {
  type_name: string;
  required_checkpoint_type: string | null;
}): boolean {
  const isReadingType = homework.type_name === "阅读" ||
    homework.type_name === "英文阅读" ||
    homework.type_name === "中文阅读";
  const noRecordingRequired =
    homework.required_checkpoint_type === "" ||
    homework.required_checkpoint_type === null;
  return isReadingType && noRecordingRequired;
}

/**
 * Create a check-in record that auto-completes a reading homework after
 * the child finishes the article + quiz.
 *
 * The supabase client can be the real @supabase/ssr browser client — we
 * use eslint-disable and an opaque type to avoid builder-chain mismatches.
 *
 * Returns the created row or null on error (errors are logged, not thrown).
 */
export async function createReadingAutoCheckin(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  childId: string;
  homework: { id: string; point_value: number };
  articleId: string;
  score: number;
  total: number;
  articleLanguage?: "zh" | "en";
}) {
  const { supabase, childId, homework, articleId, score, total, articleLanguage } = input;
  const langLabel = articleLanguage === "en" ? "英文" : "中文";
  const note = `${langLabel}阅读自动打卡 — 文章: ${articleId}, 得分: ${score}/${total}`;

  try {
    const { data, error } = await supabase
      .from("check_ins")
      .insert({
        child_id: childId,
        homework_id: homework.id,
        completed_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        points_earned: homework.point_value,
        awarded_points: homework.point_value,
        is_scored: true,
        is_late: false,
        proof_type: null,
        note,
      })
      .select()
      .single();

    if (error || !data) {
      console.error(
        "createReadingAutoCheckin failed:",
        error?.message || "No data returned"
      );
      return null;
    }

    return data;
  } catch (err) {
    console.error("createReadingAutoCheckin error:", err);
    return null;
  }
}
