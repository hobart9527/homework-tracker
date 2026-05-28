type SupabaseInsertResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseSelectResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export const MAX_VOICE_PUSH_DELIVERY_ATTEMPTS = 3;

export type VoicePushTaskRecord = {
  id: string;
  child_id: string;
  homework_id: string;
  check_in_id: string;
  attachment_id: string;
  file_path: string;
  status: "pending" | "retrying" | "sent" | "failed";
  delivery_attempts: number;
  failure_reason: string | null;
  last_attempted_at: string | null;
  sent_at: string | null;
  created_at: string | null;
};

type SupabaseLike = {
  from: (table: string) => {
    insert?: (
      payload: Record<string, unknown>
    ) =>
      | {
          select: () => {
            single: () => Promise<SupabaseInsertResult<Record<string, unknown>>>;
          };
        }
      | Promise<SupabaseInsertResult<Record<string, unknown>>>;
    update?: (
      payload: Record<string, unknown>
    ) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

async function logVoicePushTaskAttempt(input: {
  supabase: SupabaseLike;
  taskId: string;
  attemptNumber: number;
  status: "retrying" | "failed" | "sent";
  failureReason: string | null;
}) {
  const insertResult = input.supabase
    .from("voice_push_attempts")
    .insert!({
      voice_push_task_id: input.taskId,
      attempt_number: input.attemptNumber,
      status: input.status,
      failure_reason: input.failureReason,
    });

  const { error } =
    typeof (insertResult as { select?: unknown }).select === "function"
      ? await (insertResult as {
          select: () => {
            single: () => Promise<SupabaseInsertResult<Record<string, unknown>>>;
          };
        })
          .select()
          .single()
      : await (insertResult as Promise<SupabaseInsertResult<Record<string, unknown>>>);

  if (
    error?.message.includes("voice_push_attempts_task_attempt_status_key")
  ) {
    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

export async function createVoicePushTask(input: {
  supabase: SupabaseLike;
  task: {
    childId: string;
    homeworkId: string;
    checkInId: string;
    attachmentId: string;
    filePath: string;
  };
}) {
  const insertResult = input.supabase
    .from("voice_push_tasks")
    .insert!({
      child_id: input.task.childId,
      homework_id: input.task.homeworkId,
      check_in_id: input.task.checkInId,
      attachment_id: input.task.attachmentId,
      file_path: input.task.filePath,
      status: "pending",
    });

  const { data, error } =
    typeof (insertResult as { select?: unknown }).select === "function"
      ? await (insertResult as {
          select: () => {
            single: () => Promise<SupabaseInsertResult<Record<string, unknown>>>;
          };
        })
          .select()
          .single()
      : await (insertResult as Promise<SupabaseInsertResult<Record<string, unknown>>>);

  if (error?.message.includes("voice_push_tasks_attachment_id_key")) {
    return {
      status: "duplicate" as const,
      task: null,
    };
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: "created" as const,
    task: data,
  };
}

export async function markVoicePushTaskAttemptFailed(input: {
  supabase: SupabaseLike;
  taskId: string;
  deliveryAttempts: number;
  failureReason: string;
  willRetry: boolean;
}) {
  const attemptedAt = new Date().toISOString();

  const { error } = await input.supabase
    .from("voice_push_tasks")
    .update!({
      status: input.willRetry ? "retrying" : "failed",
      delivery_attempts: input.deliveryAttempts,
      failure_reason: input.failureReason,
      last_attempted_at: attemptedAt,
      sent_at: null,
    })
    .eq("id", input.taskId);

  if (error) {
    throw new Error(error.message);
  }

  await logVoicePushTaskAttempt({
    supabase: input.supabase,
    taskId: input.taskId,
    attemptNumber: input.deliveryAttempts,
    status: input.willRetry ? "retrying" : "failed",
    failureReason: input.failureReason,
  });
}

export async function markVoicePushTaskSent(input: {
  supabase: SupabaseLike;
  taskId: string;
  deliveryAttempts: number;
}) {
  const attemptedAt = new Date().toISOString();

  const { error } = await input.supabase
    .from("voice_push_tasks")
    .update!({
      status: "sent",
      delivery_attempts: input.deliveryAttempts,
      failure_reason: null,
      last_attempted_at: attemptedAt,
      sent_at: attemptedAt,
    })
    .eq("id", input.taskId);

  if (error) {
    throw new Error(error.message);
  }

  await logVoicePushTaskAttempt({
    supabase: input.supabase,
    taskId: input.taskId,
    attemptNumber: input.deliveryAttempts,
    status: "sent",
    failureReason: null,
  });
}
