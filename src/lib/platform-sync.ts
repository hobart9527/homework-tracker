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
    update?: (
      payload: Record<string, unknown>
    ) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function claimPlatformSyncJob(input: {
  supabase: SupabaseLike;
  platformAccountId: string;
  triggerMode: "scheduled" | "manual";
  windowKey: string;
}) {
  const { data, error } = await input.supabase
    .from("platform_sync_jobs")
    .insert!({
      platform_account_id: input.platformAccountId,
      trigger_mode: input.triggerMode,
      status: "running",
      window_key: input.windowKey,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error?.message.includes("platform_sync_jobs_account_window_key")) {
    return {
      status: "duplicate" as const,
      job: null,
    };
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: "claimed" as const,
    job: data,
  };
}

export async function completePlatformSyncJob(input: {
  supabase: SupabaseLike;
  jobId: string;
  platformAccountId: string;
  rawSummary: Record<string, unknown>;
}) {
  const finishedAt = new Date().toISOString();

  const { error: jobError } = await input.supabase
    .from("platform_sync_jobs")
    .update!({
      status: "completed",
      raw_summary: input.rawSummary,
      finished_at: finishedAt,
    })
    .eq("id", input.jobId);

  if (jobError) {
    throw new Error(jobError.message);
  }

  const { error: accountError } = await input.supabase
    .from("platform_accounts")
    .update!({
      status: "active",
      last_synced_at: finishedAt,
    })
    .eq("id", input.platformAccountId);

  if (accountError) {
    throw new Error(accountError.message);
  }
}

export async function markPlatformAccountAttentionRequired(input: {
  supabase: SupabaseLike;
  jobId: string;
  platformAccountId: string;
  errorSummary: string;
}) {
  const finishedAt = new Date().toISOString();

  const { error: jobError } = await input.supabase
    .from("platform_sync_jobs")
    .update!({
      status: "attention_required",
      error_summary: input.errorSummary,
      finished_at: finishedAt,
    })
    .eq("id", input.jobId);

  if (jobError) {
    throw new Error(jobError.message);
  }

  const { error: accountError } = await input.supabase
    .from("platform_accounts")
    .update!({
      status: "attention_required",
    })
    .eq("id", input.platformAccountId);

  if (accountError) {
    throw new Error(accountError.message);
  }
}
