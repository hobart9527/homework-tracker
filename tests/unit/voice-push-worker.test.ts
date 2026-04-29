import { beforeEach, describe, expect, it, vi } from "vitest";
import { runVoicePushDeliveryBatch } from "@/lib/voice-push-worker";

const listVoicePushTasksForDeliveryMock = vi.hoisted(() => vi.fn());
const buildVoicePushDeliveryRequestMock = vi.hoisted(() => vi.fn());
const markVoicePushTaskSentMock = vi.hoisted(() => vi.fn());
const markVoicePushTaskAttemptFailedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/voice-push-tasks", () => ({
  MAX_VOICE_PUSH_DELIVERY_ATTEMPTS: 3,
  listVoicePushTasksForDelivery: listVoicePushTasksForDeliveryMock,
  buildVoicePushDeliveryRequest: buildVoicePushDeliveryRequestMock,
  markVoicePushTaskSent: markVoicePushTaskSentMock,
  markVoicePushTaskAttemptFailed: markVoicePushTaskAttemptFailedMock,
}));

describe("runVoicePushDeliveryBatch", () => {
  beforeEach(() => {
    listVoicePushTasksForDeliveryMock.mockReset();
    buildVoicePushDeliveryRequestMock.mockReset();
    markVoicePushTaskSentMock.mockReset();
    markVoicePushTaskAttemptFailedMock.mockReset();
  });

  it("delivers queued tasks and marks them sent", async () => {
    listVoicePushTasksForDeliveryMock.mockResolvedValue([
      {
        id: "voice-task-1",
        child_id: "child-1",
        homework_id: "hw-1",
        check_in_id: "check-1",
        attachment_id: "att-1",
        file_path: "attachments/audio-1.m4a",
        status: "pending",
        delivery_attempts: 0,
        failure_reason: null,
        last_attempted_at: null,
        sent_at: null,
        created_at: "2026-04-20T09:00:00.000Z",
      },
    ]);
    buildVoicePushDeliveryRequestMock.mockReturnValue({
      taskId: "voice-task-1",
      childId: "child-1",
      homeworkId: "hw-1",
      attachmentId: "att-1",
      filePath: "attachments/audio-1.m4a",
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: "Mia 默认群",
      attemptNumber: 1,
      deliveryKey: "voice-push:voice-task-1:att-1",
    });
    const deliver = vi.fn().mockResolvedValue({
      status: "sent",
      remoteMessageId: "bridge-msg-1",
    });
    const resolveTarget = vi.fn().mockResolvedValue({
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: "Mia 默认群",
    });

    const result = await runVoicePushDeliveryBatch({
      supabase: {} as any,
      deliver,
      resolveTarget,
      limit: 10,
    });

    expect(deliver).toHaveBeenCalledWith({
      taskId: "voice-task-1",
      childId: "child-1",
      homeworkId: "hw-1",
      attachmentId: "att-1",
      filePath: "attachments/audio-1.m4a",
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: "Mia 默认群",
      attemptNumber: 1,
      deliveryKey: "voice-push:voice-task-1:att-1",
    });
    expect(markVoicePushTaskSentMock).toHaveBeenCalledWith({
      supabase: {} as any,
      taskId: "voice-task-1",
      deliveryAttempts: 1,
    });
    expect(result).toEqual({
      processedCount: 1,
      sentCount: 1,
      retryingCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [
        {
          taskId: "voice-task-1",
          status: "sent",
          attemptNumber: 1,
          remoteMessageId: "bridge-msg-1",
        },
      ],
    });
  });

  it("treats duplicate bridge acknowledgements as sent to preserve idempotency", async () => {
    listVoicePushTasksForDeliveryMock.mockResolvedValue([
      {
        id: "voice-task-2",
        child_id: "child-1",
        homework_id: "hw-1",
        check_in_id: "check-1",
        attachment_id: "att-2",
        file_path: "attachments/audio-2.m4a",
        status: "retrying",
        delivery_attempts: 1,
        failure_reason: "timeout",
        last_attempted_at: "2026-04-20T09:10:00.000Z",
        sent_at: null,
        created_at: "2026-04-20T09:00:00.000Z",
      },
    ]);
    buildVoicePushDeliveryRequestMock.mockReturnValue({
      taskId: "voice-task-2",
      childId: "child-1",
      homeworkId: "hw-1",
      attachmentId: "att-2",
      filePath: "attachments/audio-2.m4a",
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: null,
      attemptNumber: 2,
      deliveryKey: "voice-push:voice-task-2:att-2",
    });
    const deliver = vi.fn().mockResolvedValue({
      status: "duplicate",
      remoteMessageId: "bridge-msg-2",
    });
    const resolveTarget = vi.fn().mockResolvedValue({
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: null,
    });

    const result = await runVoicePushDeliveryBatch({
      supabase: {} as any,
      deliver,
      resolveTarget,
    });

    expect(markVoicePushTaskSentMock).toHaveBeenCalledWith({
      supabase: {} as any,
      taskId: "voice-task-2",
      deliveryAttempts: 2,
    });
    expect(result.results).toEqual([
      {
        taskId: "voice-task-2",
        status: "sent",
        attemptNumber: 2,
        remoteMessageId: "bridge-msg-2",
      },
    ]);
  });

  it("marks failed deliveries as retrying while attempts remain", async () => {
    listVoicePushTasksForDeliveryMock.mockResolvedValue([
      {
        id: "voice-task-3",
        child_id: "child-1",
        homework_id: "hw-1",
        check_in_id: "check-1",
        attachment_id: "att-3",
        file_path: "attachments/audio-3.m4a",
        status: "retrying",
        delivery_attempts: 1,
        failure_reason: "offline",
        last_attempted_at: "2026-04-20T09:10:00.000Z",
        sent_at: null,
        created_at: "2026-04-20T09:00:00.000Z",
      },
    ]);
    buildVoicePushDeliveryRequestMock.mockReturnValue({
      taskId: "voice-task-3",
      childId: "child-1",
      homeworkId: "hw-1",
      attachmentId: "att-3",
      filePath: "attachments/audio-3.m4a",
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: null,
      attemptNumber: 2,
      deliveryKey: "voice-push:voice-task-3:att-3",
    });
    const deliver = vi.fn().mockRejectedValue(new Error("Bridge offline"));
    const resolveTarget = vi.fn().mockResolvedValue({
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: null,
    });

    const result = await runVoicePushDeliveryBatch({
      supabase: {} as any,
      deliver,
      resolveTarget,
      maxAttempts: 3,
    });

    expect(markVoicePushTaskAttemptFailedMock).toHaveBeenCalledWith({
      supabase: {} as any,
      taskId: "voice-task-3",
      deliveryAttempts: 2,
      failureReason: "Bridge offline",
      willRetry: true,
    });
    expect(result.results).toEqual([
      {
        taskId: "voice-task-3",
        status: "retrying",
        attemptNumber: 2,
        failureReason: "Bridge offline",
      },
    ]);
  });

  it("marks failed deliveries terminal when the retry budget is exhausted", async () => {
    listVoicePushTasksForDeliveryMock.mockResolvedValue([
      {
        id: "voice-task-4",
        child_id: "child-1",
        homework_id: "hw-1",
        check_in_id: "check-1",
        attachment_id: "att-4",
        file_path: "attachments/audio-4.m4a",
        status: "retrying",
        delivery_attempts: 2,
        failure_reason: "offline",
        last_attempted_at: "2026-04-20T09:10:00.000Z",
        sent_at: null,
        created_at: "2026-04-20T09:00:00.000Z",
      },
    ]);
    buildVoicePushDeliveryRequestMock.mockReturnValue({
      taskId: "voice-task-4",
      childId: "child-1",
      homeworkId: "hw-1",
      attachmentId: "att-4",
      filePath: "attachments/audio-4.m4a",
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: null,
      attemptNumber: 3,
      deliveryKey: "voice-push:voice-task-4:att-4",
    });
    const deliver = vi.fn().mockResolvedValue({
      status: "failed",
      error: "Unsupported media type",
    });
    const resolveTarget = vi.fn().mockResolvedValue({
      channel: "wechat_group",
      recipientRef: "wechat-default",
      recipientLabel: null,
    });

    const result = await runVoicePushDeliveryBatch({
      supabase: {} as any,
      deliver,
      resolveTarget,
      maxAttempts: 3,
    });

    expect(markVoicePushTaskAttemptFailedMock).toHaveBeenCalledWith({
      supabase: {} as any,
      taskId: "voice-task-4",
      deliveryAttempts: 3,
      failureReason: "Unsupported media type",
      willRetry: false,
    });
    expect(result.results).toEqual([
      {
        taskId: "voice-task-4",
        status: "failed",
        attemptNumber: 3,
        failureReason: "Unsupported media type",
      },
    ]);
  });

  it("fails tasks immediately when no delivery target is configured", async () => {
    listVoicePushTasksForDeliveryMock.mockResolvedValue([
      {
        id: "voice-task-5",
        child_id: "child-1",
        homework_id: "hw-2",
        check_in_id: "check-2",
        attachment_id: "att-5",
        file_path: "attachments/audio-5.m4a",
        status: "pending",
        delivery_attempts: 0,
        failure_reason: null,
        last_attempted_at: null,
        sent_at: null,
        created_at: "2026-04-20T09:00:00.000Z",
      },
    ]);

    const deliver = vi.fn();
    const resolveTarget = vi.fn().mockResolvedValue(null);

    const result = await runVoicePushDeliveryBatch({
      supabase: {} as any,
      deliver,
      resolveTarget,
    });

    expect(deliver).not.toHaveBeenCalled();
    expect(markVoicePushTaskAttemptFailedMock).toHaveBeenCalledWith({
      supabase: {} as any,
      taskId: "voice-task-5",
      deliveryAttempts: 1,
      failureReason: "No active message routing rule for this homework",
      willRetry: false,
    });
    expect(result.results).toEqual([
      {
        taskId: "voice-task-5",
        status: "failed",
        attemptNumber: 1,
        failureReason: "No active message routing rule for this homework",
      },
    ]);
  });
});
