import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/platform-sync/import/route";
import { buildHouseholdDailySummary } from "@/lib/family-notifications";
import { logNotificationDelivery } from "@/lib/notification-deliveries";
import {
  buildVoicePushDeliveryKey,
  buildVoicePushDeliveryRequest,
  shouldRetryVoicePushTask,
} from "@/lib/voice-push-tasks";

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

function makeSupabaseClient(options?: {
  existingCheckIn?: boolean;
}) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: { user: { id: "parent-1" } },
        },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "platform_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "acct-1",
                  child_id: "child-1",
                  platform: "ixl",
                  external_account_ref: "family-account",
                },
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === "platform_sync_jobs") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "sync-job-1",
                  platform_account_id: "acct-1",
                  trigger_mode: "manual",
                  status: "running",
                },
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === "children") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "child-1",
                    parent_id: "parent-1",
                  },
                  error: null,
                }),
              })),
            })),
          })),
        };
      }

      if (table === "homeworks") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "hw-1",
                  child_id: "child-1",
                  type_name: "数学",
                  title: "Math",
                  repeat_type: "daily",
                  repeat_days: null,
                  repeat_interval: null,
                  repeat_start_date: null,
                  repeat_end_date: null,
                  point_value: 5,
                  estimated_minutes: 20,
                  required_checkpoint_type: null,
                  platform_binding_platform: null,
                  platform_binding_source_ref: null,
                  is_active: true,
                },
              ],
              error: null,
            }),
          })),
        };
      }

      if (table === "check_ins") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn().mockResolvedValue({
                  data: options?.existingCheckIn
                    ? [{ id: "manual-check-1", homework_id: "hw-1" }]
                    : [],
                  error: null,
                }),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "check-1",
                  homework_id: "hw-1",
                },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "learning_events") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "event-1",
                  child_id: "child-1",
                  local_date_key: "2026-04-20",
                },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "homework_auto_matches") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "match-1" },
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "notification_deliveries") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "delivery-1" },
                error: null,
              }),
            })),
          })),
        };
      }

      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      };
    }),
  };
}

describe("family platform sync acceptance", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("keeps same-day sync correctness and manual precedence intact at the API boundary", async () => {
    createClientMock.mockResolvedValueOnce(makeSupabaseClient());
    const autoCompletedResponse = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            subject: "math",
            durationMinutes: 25,
            score: 0.92,
            completionState: "completed",
            sourceRef: "ixl-a1-2026-04-20",
            rawPayload: { skill: "A.1" },
          },
        }),
      })
    );

    createClientMock.mockResolvedValueOnce(
      makeSupabaseClient({ existingCheckIn: true })
    );
    const manualPrecedenceResponse = await POST(
      new Request("http://localhost/api/platform-sync/import", {
        method: "POST",
        body: JSON.stringify({
          platformAccountId: "acct-1",
          event: {
            occurredAt: "2026-04-20T10:00:00.000Z",
            eventType: "skill_practice",
            title: "IXL A.1",
            subject: "math",
            durationMinutes: 25,
            score: 0.92,
            completionState: "completed",
            sourceRef: "ixl-a1-2026-04-20",
            rawPayload: { skill: "A.1" },
          },
        }),
      })
    );

    expect(await autoCompletedResponse.json()).toMatchObject({
      ingestStatus: "inserted",
      homeworkResults: [
        {
          homeworkId: "hw-1",
          decision: "auto_completed",
          createdCheckInId: "check-1",
        },
      ],
    });
    expect(await manualPrecedenceResponse.json()).toMatchObject({
      ingestStatus: "inserted",
      homeworkResults: [
        {
          homeworkId: "hw-1",
          decision: "already_completed",
          createdCheckInId: null,
        },
      ],
    });
  });

  it("supports a multi-child household Telegram digest with one deduplicated delivery record", async () => {
    const payload = buildHouseholdDailySummary({
      dateLabel: "4月20日",
      children: [
        {
          childName: "Mia",
          completedTitles: ["IXL Math Practice"],
          incompleteTitles: ["Reading Log"],
        },
        {
          childName: "Leo",
          completedTitles: ["Khan Reading"],
          incompleteTitles: [],
        },
      ],
    });

    expect(payload.sections).toHaveLength(2);

    const result = await logNotificationDelivery({
      supabase: makeSupabaseClient() as any,
      channel: "telegram",
      recipientRef: "parent-telegram-chat",
      template: "household_daily_summary",
      payloadSummary: payload,
      dedupKey: "telegram:daily-summary:2026-04-20",
      status: "sent",
    });

    expect(result).toMatchObject({
      status: "logged",
      delivery: {
        id: "delivery-1",
      },
    });
  });

  it("preserves bridge idempotency for the same audio task across retries", () => {
    const request = buildVoicePushDeliveryRequest({
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
    });

    expect(request.deliveryKey).toBe(
      buildVoicePushDeliveryKey({
        taskId: "voice-task-1",
        attachmentId: "att-1",
      })
    );
    expect(
      shouldRetryVoicePushTask({
        status: "retrying",
        sentAt: null,
        deliveryAttempts: 1,
      })
    ).toBe(true);
    expect(
      shouldRetryVoicePushTask({
        status: "retrying",
        sentAt: null,
        deliveryAttempts: 3,
      })
    ).toBe(false);
  });
});
