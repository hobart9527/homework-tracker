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
  });

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
