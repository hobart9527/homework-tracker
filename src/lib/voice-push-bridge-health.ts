type BridgeHealthResult =
  | {
      status: "healthy";
      healthUrl: string;
      deliveredCount: number | null;
    }
  | {
      status: "unhealthy";
      healthUrl: string;
      error: string;
    };

function resolveBridgeHealthUrl(bridgeUrl: string) {
  const url = new URL(bridgeUrl);

  if (url.pathname.endsWith("/send")) {
    url.pathname = `${url.pathname.slice(0, -5)}/health`;
  } else {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/health`;
  }

  url.search = "";
  return url.toString();
}

export async function inspectVoicePushBridgeHealth(input?: {
  fetchImpl?: typeof fetch;
}): Promise<BridgeHealthResult> {
  const bridgeUrl = process.env.VOICE_PUSH_BRIDGE_URL;

  if (!bridgeUrl) {
    throw new Error("VOICE_PUSH_BRIDGE_URL is not configured");
  }

  const healthUrl = resolveBridgeHealthUrl(bridgeUrl);
  const fetchImpl = input?.fetchImpl ?? fetch;

  const response = await fetchImpl(healthUrl, {
    method: "GET",
    headers: process.env.VOICE_PUSH_BRIDGE_TOKEN
      ? {
          authorization: `Bearer ${process.env.VOICE_PUSH_BRIDGE_TOKEN}`,
        }
      : undefined,
  });

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    return {
      status: "healthy",
      healthUrl,
      deliveredCount:
        payload &&
        typeof payload === "object" &&
        "deliveredCount" in payload &&
        typeof payload.deliveredCount === "number"
          ? payload.deliveredCount
          : null,
    };
  }

  const error =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
      ? payload.error
      : `Bridge health check failed with status ${response.status}`;

  return {
    status: "unhealthy",
    healthUrl,
    error,
  };
}

