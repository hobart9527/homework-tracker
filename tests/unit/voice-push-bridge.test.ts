import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverVoicePushRequest } from "@/lib/voice-push-bridge";

describe("deliverVoicePushRequest", () => {
  const originalBridgeUrl = process.env.VOICE_PUSH_BRIDGE_URL;
  const originalBridgeToken = process.env.VOICE_PUSH_BRIDGE_TOKEN;

  beforeEach(() => {
    process.env.VOICE_PUSH_BRIDGE_URL = "https://bridge.example.test/send";
    process.env.VOICE_PUSH_BRIDGE_TOKEN = "bridge-token";
  });

  afterEach(() => {
    process.env.VOICE_PUSH_BRIDGE_URL = originalBridgeUrl;
    process.env.VOICE_PUSH_BRIDGE_TOKEN = originalBridgeToken;
  });

  it("posts the delivery request to the configured bridge endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue({
        remoteMessageId: "bridge-msg-1",
      }),
    });

    const result = await deliverVoicePushRequest({
      request: {
        taskId: "voice-task-1",
        childId: "child-1",
        homeworkId: "hw-1",
        attachmentId: "att-1",
        filePath: "attachments/audio-1.m4a",
        channel: "wechat_group",
        recipientRef: "wechat-group-math",
        recipientLabel: "数学群",
        attemptNumber: 1,
        deliveryKey: "voice-push:voice-task-1:att-1",
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://bridge.example.test/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer bridge-token",
          "x-delivery-key": "voice-push:voice-task-1:att-1",
        }),
        body: JSON.stringify({
          taskId: "voice-task-1",
          childId: "child-1",
          homeworkId: "hw-1",
          attachmentId: "att-1",
          filePath: "attachments/audio-1.m4a",
          channel: "wechat_group",
          recipientRef: "wechat-group-math",
          recipientLabel: "数学群",
          attemptNumber: 1,
          deliveryKey: "voice-push:voice-task-1:att-1",
        }),
      })
    );
    expect(result).toEqual({
      status: "sent",
      remoteMessageId: "bridge-msg-1",
    });
  });

  it("treats a 409 bridge response as a duplicate send acknowledgement", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 409,
      json: vi.fn().mockResolvedValue({
        remoteMessageId: "bridge-msg-2",
      }),
    });

    const result = await deliverVoicePushRequest({
      request: {
        taskId: "voice-task-2",
        childId: "child-1",
        homeworkId: "hw-1",
        attachmentId: "att-2",
        filePath: "attachments/audio-2.m4a",
        channel: "wechat_group",
        recipientRef: "wechat-group-reading",
        recipientLabel: null,
        attemptNumber: 2,
        deliveryKey: "voice-push:voice-task-2:att-2",
      },
      fetchImpl,
    });

    expect(result).toEqual({
      status: "duplicate",
      remoteMessageId: "bridge-msg-2",
    });
  });

  it("returns a retryable failure result for non-success bridge responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 503,
      text: vi.fn().mockResolvedValue("Bridge unavailable"),
      json: vi.fn().mockRejectedValue(new Error("not json")),
    });

    const result = await deliverVoicePushRequest({
      request: {
        taskId: "voice-task-3",
        childId: "child-1",
        homeworkId: "hw-1",
        attachmentId: "att-3",
        filePath: "attachments/audio-3.m4a",
        channel: "telegram_chat",
        recipientRef: "-1001234567890",
        recipientLabel: "家长群",
        attemptNumber: 1,
        deliveryKey: "voice-push:voice-task-3:att-3",
      },
      fetchImpl,
    });

    expect(result).toEqual({
      status: "failed",
      error: "Bridge unavailable",
    });
  });

  it("fails fast when the bridge endpoint is not configured", async () => {
    process.env.VOICE_PUSH_BRIDGE_URL = "";

    await expect(
      deliverVoicePushRequest({
        request: {
          taskId: "voice-task-4",
          childId: "child-1",
          homeworkId: "hw-1",
          attachmentId: "att-4",
          filePath: "attachments/audio-4.m4a",
          channel: "wechat_group",
          recipientRef: "wechat-default",
          recipientLabel: null,
          attemptNumber: 1,
          deliveryKey: "voice-push:voice-task-4:att-4",
        },
        fetchImpl: vi.fn(),
      })
    ).rejects.toThrow("VOICE_PUSH_BRIDGE_URL is not configured");
  });
});
