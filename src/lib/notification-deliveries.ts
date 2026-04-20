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

export async function logNotificationDelivery(input: {
  supabase: SupabaseLike;
  channel: string;
  recipientRef: string;
  template: string;
  payloadSummary: Json;
  dedupKey: string;
  status: "pending" | "sent" | "failed";
  failureReason?: string | null;
}) {
  const sentAt = input.status === "sent" ? new Date().toISOString() : null;

  const { data, error } = await input.supabase
    .from("notification_deliveries")
    .insert({
      channel: input.channel,
      recipient_ref: input.recipientRef,
      template: input.template,
      payload_summary: input.payloadSummary,
      dedup_key: input.dedupKey,
      status: input.status,
      sent_at: sentAt,
      failure_reason: input.failureReason ?? null,
    })
    .select()
    .single();

  if (error?.message.includes("notification_deliveries_dedup_key_key")) {
    return {
      status: "duplicate" as const,
      delivery: null,
    };
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: "logged" as const,
    delivery: data,
  };
}
