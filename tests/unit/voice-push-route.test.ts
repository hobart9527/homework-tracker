import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());
const runVoicePushDeliveryBatchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
  createServiceRoleClient: createServiceRoleClientMock,
}));

vi.mock("@/lib/voice-push-worker", () => ({
  runVoicePushDeliveryBatch: runVoicePushDeliveryBatchMock,
}));

vi.mock("@/lib/voice-push-bridge", () => ({
  deliverVoicePushRequest: vi.fn(),
}));

import { GET } from "@/app/api/voice-push/run/route";

function makeSupabaseClient(options?: { sessionUserId?: string | null }) {
  const sessionUserId =
    options && "sessionUserId" in options ? options.sessionUserId : "parent-1";

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: sessionUserId ? { user: { id: sessionUserId } } : null,
        },
      }),
    },
  };
}

describe("voice push run route", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    createClientMock.mockReset();
    createServiceRoleClientMock.mockReset();
    runVoicePushDeliveryBatchMock.mockReset();
    process.env.CRON_SECRET = "cron-secret";
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  it("rejects unauthenticated non-cron requests", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ sessionUserId: null })
    );

    const response = await GET(
      new Request("http://localhost/api/voice-push/run")
    );

    expect(response.status).toBe(401);
  });

  it("runs the delivery batch for authenticated requests", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());
    runVoicePushDeliveryBatchMock.mockResolvedValue({
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

    const response = await GET(
      new Request("http://localhost/api/voice-push/run?limit=5")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runVoicePushDeliveryBatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: expect.any(Object),
        limit: 5,
      })
    );
    expect(body).toMatchObject({
      processedCount: 1,
      sentCount: 1,
      results: [
        {
          taskId: "voice-task-1",
          status: "sent",
        },
      ],
    });
  });

  it("uses the service-role client for cron-triggered requests", async () => {
    createServiceRoleClientMock.mockResolvedValue(makeSupabaseClient());
    runVoicePushDeliveryBatchMock.mockResolvedValue({
      processedCount: 0,
      sentCount: 0,
      retryingCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [],
    });

    const response = await GET(
      new Request("http://localhost/api/voice-push/run", {
        headers: {
          "x-cron-secret": "cron-secret",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(createServiceRoleClientMock).toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("returns a 500 response when the delivery batch fails", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());
    runVoicePushDeliveryBatchMock.mockRejectedValue(
      new Error("VOICE_PUSH_BRIDGE_URL is not configured")
    );

    const response = await GET(
      new Request("http://localhost/api/voice-push/run")
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "VOICE_PUSH_BRIDGE_URL is not configured",
    });
  });
});
