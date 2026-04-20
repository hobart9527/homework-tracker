import { describe, expect, it, vi } from "vitest";
import {
  buildVoicePushDeliveryKey,
  buildVoicePushDeliveryRequest,
  createVoicePushTask,
  listVoicePushTasksForDelivery,
  markVoicePushTaskAttemptFailed,
  markVoicePushTaskSent,
  shouldRetryVoicePushTask,
} from "@/lib/voice-push-tasks";

describe("createVoicePushTask", () => {
  it("creates one pending task per audio attachment", async () => {
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "voice-task-1",
            attachment_id: "att-1",
            status: "pending",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    };

    const result = await createVoicePushTask({
      supabase: supabase as any,
      task: {
        childId: "child-1",
        homeworkId: "hw-1",
        checkInId: "check-1",
        attachmentId: "att-1",
        filePath: "attachments/audio-1.m4a",
      },
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        child_id: "child-1",
        homework_id: "hw-1",
        check_in_id: "check-1",
        attachment_id: "att-1",
        file_path: "attachments/audio-1.m4a",
        status: "pending",
      })
    );
    expect(result).toMatchObject({
      status: "created",
      task: {
        id: "voice-task-1",
      },
    });
  });

  it("treats duplicate attachment tasks as already created", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                message:
                  "duplicate key value violates unique constraint voice_push_tasks_attachment_id_key",
              },
            }),
          })),
        })),
      })),
    };

    const result = await createVoicePushTask({
      supabase: supabase as any,
      task: {
        childId: "child-1",
        homeworkId: "hw-1",
        checkInId: "check-1",
        attachmentId: "att-1",
        filePath: "attachments/audio-1.m4a",
      },
    });

    expect(result).toEqual({
      status: "duplicate",
      task: null,
    });
  });
});

describe("markVoicePushTaskAttemptFailed", () => {
  it("moves the task to retrying while recording the latest failure attempt", async () => {
    const updateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const attemptInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "attempt-1",
            voice_push_task_id: "voice-task-1",
            attempt_number: 2,
            status: "retrying",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "voice_push_tasks") {
          return {
            update: updateMock,
          };
        }

        return {
          insert: attemptInsertMock,
        };
      }),
    };

    await markVoicePushTaskAttemptFailed({
      supabase: supabase as any,
      taskId: "voice-task-1",
      deliveryAttempts: 2,
      failureReason: "Bridge offline",
      willRetry: true,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "retrying",
        delivery_attempts: 2,
        failure_reason: "Bridge offline",
        last_attempted_at: expect.any(String),
        sent_at: null,
      })
    );
    expect(attemptInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_push_task_id: "voice-task-1",
        attempt_number: 2,
        status: "retrying",
        failure_reason: "Bridge offline",
      })
    );
  });

  it("marks the task failed when no further retries will run", async () => {
    const updateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const attemptInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "attempt-2",
            voice_push_task_id: "voice-task-2",
            attempt_number: 3,
            status: "failed",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "voice_push_tasks") {
          return {
            update: updateMock,
          };
        }

        return {
          insert: attemptInsertMock,
        };
      }),
    };

    await markVoicePushTaskAttemptFailed({
      supabase: supabase as any,
      taskId: "voice-task-2",
      deliveryAttempts: 3,
      failureReason: "Unsupported media type",
      willRetry: false,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        delivery_attempts: 3,
        failure_reason: "Unsupported media type",
        last_attempted_at: expect.any(String),
      })
    );
    expect(attemptInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_push_task_id: "voice-task-2",
        attempt_number: 3,
        status: "failed",
        failure_reason: "Unsupported media type",
      })
    );
  });
});

describe("markVoicePushTaskSent", () => {
  it("records a successful send with sent timestamp and clears the failure message", async () => {
    const updateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));
    const attemptInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "attempt-3",
            voice_push_task_id: "voice-task-1",
            attempt_number: 2,
            status: "sent",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "voice_push_tasks") {
          return {
            update: updateMock,
          };
        }

        return {
          insert: attemptInsertMock,
        };
      }),
    };

    await markVoicePushTaskSent({
      supabase: supabase as any,
      taskId: "voice-task-1",
      deliveryAttempts: 2,
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        delivery_attempts: 2,
        failure_reason: null,
        last_attempted_at: expect.any(String),
        sent_at: expect.any(String),
      })
    );
    expect(attemptInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_push_task_id: "voice-task-1",
        attempt_number: 2,
        status: "sent",
        failure_reason: null,
      })
    );
  });
});

describe("voice push delivery helpers", () => {
  it("builds a stable delivery key that does not change across retries", () => {
    expect(
      buildVoicePushDeliveryKey({
        taskId: "voice-task-1",
        attachmentId: "att-1",
      })
    ).toBe("voice-push:voice-task-1:att-1");
  });

  it("builds the next delivery request with a deterministic idempotency key", () => {
    expect(
      buildVoicePushDeliveryRequest({
        id: "voice-task-1",
        child_id: "child-1",
        homework_id: "hw-1",
        check_in_id: "check-1",
        attachment_id: "att-1",
        file_path: "attachments/audio-1.m4a",
        status: "retrying",
        delivery_attempts: 1,
        failure_reason: "Bridge offline",
        last_attempted_at: "2026-04-20T10:00:00.000Z",
        sent_at: null,
        created_at: "2026-04-20T09:50:00.000Z",
      })
    ).toEqual({
      taskId: "voice-task-1",
      attachmentId: "att-1",
      filePath: "attachments/audio-1.m4a",
      attemptNumber: 2,
      deliveryKey: "voice-push:voice-task-1:att-1",
    });
  });

  it("only retries tasks that are unsent and still within the retry budget", () => {
    expect(
      shouldRetryVoicePushTask({
        status: "pending",
        sentAt: null,
        deliveryAttempts: 0,
      })
    ).toBe(true);

    expect(
      shouldRetryVoicePushTask({
        status: "retrying",
        sentAt: null,
        deliveryAttempts: 2,
      })
    ).toBe(true);

    expect(
      shouldRetryVoicePushTask({
        status: "retrying",
        sentAt: null,
        deliveryAttempts: 3,
      })
    ).toBe(false);

    expect(
      shouldRetryVoicePushTask({
        status: "failed",
        sentAt: null,
        deliveryAttempts: 1,
      })
    ).toBe(false);

    expect(
      shouldRetryVoicePushTask({
        status: "sent",
        sentAt: "2026-04-20T11:00:00.000Z",
        deliveryAttempts: 1,
      })
    ).toBe(false);
  });

  it("lists deliverable tasks in creation order and filters out exhausted retries", async () => {
    const limitMock = vi.fn().mockResolvedValue({
      data: [
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
        {
          id: "voice-task-2",
          child_id: "child-2",
          homework_id: "hw-2",
          check_in_id: "check-2",
          attachment_id: "att-2",
          file_path: "attachments/audio-2.m4a",
          status: "retrying",
          delivery_attempts: 3,
          failure_reason: "Bridge offline",
          last_attempted_at: "2026-04-20T09:30:00.000Z",
          sent_at: null,
          created_at: "2026-04-20T09:10:00.000Z",
        },
      ],
      error: null,
    });

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: limitMock,
              })),
            })),
          })),
        })),
      })),
    };

    const tasks = await listVoicePushTasksForDelivery({
      supabase: supabase as any,
      limit: 10,
    });

    expect(limitMock).toHaveBeenCalledWith(10);
    expect(tasks).toEqual([
      expect.objectContaining({
        id: "voice-task-1",
      }),
    ]);
  });
});
