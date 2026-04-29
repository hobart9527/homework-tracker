import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const inspectVoicePushBridgeHealthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/voice-push-bridge-health", () => ({
  inspectVoicePushBridgeHealth: inspectVoicePushBridgeHealthMock,
}));

import { GET } from "@/app/api/voice-push/bridge-health/route";

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

describe("voice push bridge health route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    inspectVoicePushBridgeHealthMock.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    createClientMock.mockResolvedValue(
      makeSupabaseClient({ sessionUserId: null })
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns the bridge health for authenticated users", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());
    inspectVoicePushBridgeHealthMock.mockResolvedValue({
      status: "healthy",
      healthUrl: "http://127.0.0.1:4010/health",
      deliveredCount: 2,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "healthy",
      healthUrl: "http://127.0.0.1:4010/health",
      deliveredCount: 2,
    });
  });

  it("returns a 500 response when the bridge is not configured", async () => {
    createClientMock.mockResolvedValue(makeSupabaseClient());
    inspectVoicePushBridgeHealthMock.mockRejectedValue(
      new Error("VOICE_PUSH_BRIDGE_URL is not configured")
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "VOICE_PUSH_BRIDGE_URL is not configured",
    });
  });
});

