import { resolveMessageDeliveryTarget } from "@/lib/message-routing";
import {
  MAX_VOICE_PUSH_DELIVERY_ATTEMPTS,
  buildVoicePushDeliveryRequest,
  listVoicePushTasksForDelivery,
  markVoicePushTaskAttemptFailed,
  markVoicePushTaskSent,
  type VoicePushTaskRecord,
} from "@/lib/voice-push-tasks";

type VoicePushDeliveryRequest = ReturnType<typeof buildVoicePushDeliveryRequest>;

type VoicePushDeliverResult =
  | {
      status: "sent" | "duplicate";
      remoteMessageId?: string | null;
    }
  | {
      status: "failed";
      error: string;
    };

export async function runVoicePushDeliveryBatch(input: {
  supabase: any;
  deliver: (request: VoicePushDeliveryRequest) => Promise<VoicePushDeliverResult>;
  resolveTarget?: (task: VoicePushTaskRecord) => Promise<{
    channel: "wechat_group" | "telegram_chat";
    recipientRef: string;
    recipientLabel: string | null;
  } | null>;
  generateFileUrl?: (task: VoicePushTaskRecord) => Promise<string | null>;
  limit?: number;
  maxAttempts?: number;
}) {
  const maxAttempts = input.maxAttempts ?? MAX_VOICE_PUSH_DELIVERY_ATTEMPTS;
  const resolveTarget =
    input.resolveTarget ??
    ((task: VoicePushTaskRecord) =>
      resolveMessageDeliveryTarget({
        supabase: input.supabase,
        childId: task.child_id,
        homeworkId: task.homework_id,
        channel: "wechat_group",
      }));
  const tasks = await listVoicePushTasksForDelivery({
    supabase: input.supabase,
    limit: input.limit,
  });

  const results = [];

  for (const task of tasks) {
    const target = await resolveTarget(task as VoicePushTaskRecord);
    const unresolvedRouteAttemptNumber = task.delivery_attempts + 1;

    if (!target) {
      const failureReason = "No active message routing rule for this homework";

      await markVoicePushTaskAttemptFailed({
        supabase: input.supabase,
        taskId: task.id,
        deliveryAttempts: unresolvedRouteAttemptNumber,
        failureReason,
        willRetry: false,
      });

      results.push({
        taskId: task.id,
        status: "failed" as const,
        attemptNumber: unresolvedRouteAttemptNumber,
        failureReason,
      });
      continue;
    }

    const fileUrl = input.generateFileUrl
      ? await input.generateFileUrl(task as VoicePushTaskRecord)
      : null;

    const request = buildVoicePushDeliveryRequest(
      task as VoicePushTaskRecord,
      target,
      fileUrl
    );
    const nextAttemptNumber = request.attemptNumber;

    try {
      const deliveryResult = await input.deliver(request);

      if (
        deliveryResult.status === "sent" ||
        deliveryResult.status === "duplicate"
      ) {
        await markVoicePushTaskSent({
          supabase: input.supabase,
          taskId: task.id,
          deliveryAttempts: nextAttemptNumber,
        });

        results.push({
          taskId: task.id,
          status: "sent" as const,
          attemptNumber: nextAttemptNumber,
          remoteMessageId: deliveryResult.remoteMessageId ?? null,
        });
        continue;
      }

      if (deliveryResult.status === "failed") {
        const failureReason = deliveryResult.error;
        const willRetry = nextAttemptNumber < maxAttempts;

        await markVoicePushTaskAttemptFailed({
          supabase: input.supabase,
          taskId: task.id,
          deliveryAttempts: nextAttemptNumber,
          failureReason,
          willRetry,
        });

        results.push({
          taskId: task.id,
          status: willRetry ? ("retrying" as const) : ("failed" as const),
          attemptNumber: nextAttemptNumber,
          failureReason,
        });
      }
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "Voice push delivery failed";
      const willRetry = nextAttemptNumber < maxAttempts;

      await markVoicePushTaskAttemptFailed({
        supabase: input.supabase,
        taskId: task.id,
        deliveryAttempts: nextAttemptNumber,
        failureReason,
        willRetry,
      });

      results.push({
        taskId: task.id,
        status: willRetry ? ("retrying" as const) : ("failed" as const),
        attemptNumber: nextAttemptNumber,
        failureReason,
      });
    }
  }

  return {
    processedCount: results.length,
    sentCount: results.filter((result) => result.status === "sent").length,
    retryingCount: results.filter((result) => result.status === "retrying").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    skippedCount: 0,
    results,
  };
}
