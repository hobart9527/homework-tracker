import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectVoicePushBridgeHealth } from "@/lib/voice-push-bridge-health";

describe("voice push bridge health", () => {
  const originalBridgeUrl = process.env.VOICE_PUSH_BRIDGE_URL;
  const originalBridgeToken = process.env.VOICE_PUSH_BRIDGE_TOKEN;

  beforeEach(() => {
    process.env.VOICE_PUSH_BRIDGE_URL = "http://127.0.0.1:4010/send";
    process.env.VOICE_PUSH_BRIDGE_TOKEN = "dev-bridge-token";
  });

  afterEach(() => {
    process.env.VOICE_PUSH_BRIDGE_URL = originalBridgeUrl;
    process.env.VOICE_PUSH_BRIDGE_TOKEN = originalBridgeToken;
  });

  it("checks the derived /health endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        deliveredCount: 3,
      }),
    });

    const result = await inspectVoicePushBridgeHealth({
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4010/health", {
      method: "GET",
      headers: {
        authorization: "Bearer dev-bridge-token",
      },
    });
    expect(result).toEqual({
      status: "healthy",
      healthUrl: "http://127.0.0.1:4010/health",
      deliveredCount: 3,
    });
  });

  it("returns a readable unhealthy result for non-success responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({
        error: "Bridge warming up",
      }),
    });

    const result = await inspectVoicePushBridgeHealth({
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result).toEqual({
      status: "unhealthy",
      healthUrl: "http://127.0.0.1:4010/health",
      error: "Bridge warming up",
    });
  });

  it("fails fast when the bridge url is missing", async () => {
    delete process.env.VOICE_PUSH_BRIDGE_URL;

    await expect(inspectVoicePushBridgeHealth()).rejects.toThrow(
      "VOICE_PUSH_BRIDGE_URL is not configured"
    );
  });
});

