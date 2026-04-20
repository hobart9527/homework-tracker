import { describe, expect, it, vi } from "vitest";
import { logNotificationDelivery } from "@/lib/notification-deliveries";

describe("logNotificationDelivery", () => {
  it("stores a notification delivery record with channel, recipient, and payload summary", async () => {
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "delivery-1",
            channel: "telegram",
            recipient_ref: "123456789",
            dedup_key: "telegram:child-1:homework-1",
            status: "sent",
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

    const result = await logNotificationDelivery({
      supabase: supabase as any,
      channel: "telegram",
      recipientRef: "123456789",
      template: "homework_completed",
      payloadSummary: {
        childName: "Mia",
        homeworkTitle: "IXL Math Practice",
      },
      dedupKey: "telegram:child-1:homework-1",
      status: "sent",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        recipient_ref: "123456789",
        template: "homework_completed",
        dedup_key: "telegram:child-1:homework-1",
        payload_summary: {
          childName: "Mia",
          homeworkTitle: "IXL Math Practice",
        },
        status: "sent",
      })
    );
    expect(result).toMatchObject({
      status: "logged",
      delivery: {
        id: "delivery-1",
      },
    });
  });

  it("suppresses duplicate sends when the dedup key already exists", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                message:
                  "duplicate key value violates unique constraint notification_deliveries_dedup_key_key",
              },
            }),
          })),
        })),
      })),
    };

    const result = await logNotificationDelivery({
      supabase: supabase as any,
      channel: "telegram",
      recipientRef: "123456789",
      template: "homework_completed",
      payloadSummary: {
        childName: "Mia",
      },
      dedupKey: "telegram:child-1:homework-1",
      status: "sent",
    });

    expect(result).toEqual({
      status: "duplicate",
      delivery: null,
    });
  });
});
