import { getWeComAccessToken, uploadMediaToWeCom, sendFileToWeComChat } from "@/lib/wecom";

type VoicePushDeliveryRequest = {
  taskId: string;
  attachmentId: string;
  filePath: string;
  fileUrl?: string | null;
  attemptNumber: number;
  deliveryKey: string;
};

type VoicePushDeliveryResult =
  | {
      status: "sent" | "duplicate";
      remoteMessageId?: string | null;
    }
  | {
      status: "failed";
      error: string;
    };

async function readBridgeJson(response: {
  json?: () => Promise<unknown>;
}) {
  if (typeof response.json !== "function") {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readBridgeErrorText(response: {
  text?: () => Promise<string>;
}) {
  if (typeof response.text !== "function") {
    return null;
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

export async function deliverVoicePushRequest(input: {
  request: VoicePushDeliveryRequest;
  fetchImpl?: typeof fetch;
}): Promise<VoicePushDeliveryResult> {
  const bridgeUrl = process.env.VOICE_PUSH_BRIDGE_URL;

  if (!bridgeUrl) {
    throw new Error("VOICE_PUSH_BRIDGE_URL is not configured");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetchImpl(bridgeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-delivery-key": input.request.deliveryKey,
      ...(process.env.VOICE_PUSH_BRIDGE_TOKEN
        ? {
            authorization: `Bearer ${process.env.VOICE_PUSH_BRIDGE_TOKEN}`,
          }
        : {}),
    },
    body: JSON.stringify(input.request),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));

  const payload = await readBridgeJson(response);
  const remoteMessageId =
    payload &&
    typeof payload === "object" &&
    "remoteMessageId" in payload &&
    typeof payload.remoteMessageId === "string"
      ? payload.remoteMessageId
      : null;

  if (response.status >= 200 && response.status < 300) {
    return {
      status: "sent",
      remoteMessageId,
    };
  }

  if (response.status === 409) {
    return {
      status: "duplicate",
      remoteMessageId,
    };
  }

  let bridgeError: string | null = null;

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    bridgeError = payload.error;
  }

  const errorText =
    bridgeError ??
    (await readBridgeErrorText(response)) ??
    `Bridge request failed with status ${response.status}`;

  return {
    status: "failed",
    error: errorText,
  };
}

// ─── WeCom delivery ──────────────────────────────────────────────────

const wecomDeliveredKeys = new Set<string>();

type WeComDeliveryRequest = {
  taskId: string;
  attachmentId: string;
  filePath: string;
  fileUrl?: string | null;
  recipientRef: string;
  deliveryKey: string;
};

export async function deliverVoicePushToWeCom(
  request: WeComDeliveryRequest
): Promise<VoicePushDeliveryResult> {
  const corpid = process.env.WECOM_CORPID;
  const corpsecret = process.env.WECOM_CORPSECRET;

  if (!corpid || !corpsecret) {
    return {
      status: "failed",
      error: "WECOM_CORPID or WECOM_CORPSECRET not configured",
    };
  }

  if (wecomDeliveredKeys.has(request.deliveryKey)) {
    return { status: "duplicate" };
  }

  const downloadUrl = request.fileUrl;
  if (!downloadUrl) {
    return {
      status: "failed",
      error: "No fileUrl available for WeCom delivery",
    };
  }

  let buffer: Buffer;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(downloadUrl, { signal: controller.signal })
      .finally(() => clearTimeout(timeoutId));
    if (!res.ok) {
      return {
        status: "failed",
        error: `Download failed: HTTP ${res.status}`,
      };
    }
    const arrayBuffer = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch (err) {
    return {
      status: "failed",
      error: `Download error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let filename = "recording.m4a";
  try {
    const pathname = new URL(downloadUrl).pathname;
    const basename = pathname.split("/").pop();
    if (basename) filename = basename;
  } catch {
    // keep default
  }

  try {
    const token = await getWeComAccessToken(corpid, corpsecret);
    const mediaId = await uploadMediaToWeCom(token, buffer, filename, "file");
    const msgid = await sendFileToWeComChat(token, request.recipientRef, mediaId);

    wecomDeliveredKeys.add(request.deliveryKey);

    return {
      status: "sent",
      remoteMessageId: msgid,
    };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "WeCom delivery failed",
    };
  }
}
