export type IxlManagedSessionPayload = {
  cookies?: Array<{
    name: string;
    value: string;
  }>;
  headers?: Record<string, string>;
  activityUrl?: string | null;
};

export type IxlFetchedActivity = {
  occurredAt: string;
  skillId: string;
  skillName: string;
  subject: string | null;
  scorePercent: number | null;
  durationSeconds: number | null;
  sessionId: string | null;
};

export class IxlManagedSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IxlManagedSessionError";
  }
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function findActivityArray(value: unknown): Array<Record<string, unknown>> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    const objectItems = value.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item)
    );

    return objectItems.length ? objectItems : null;
  }

  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "activities",
    "recentActivities",
    "activityItems",
    "items",
    "sessions",
  ];

  for (const key of candidateKeys) {
    const candidate = findActivityArray(record[key]);

    if (candidate) {
      return candidate;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const candidate = findActivityArray(nestedValue);

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractBootstrapJson(html: string) {
  const fixedScriptMatch = html.match(
    /<script[^>]*id=["']__IXL_ACTIVITY_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (fixedScriptMatch?.[1]) {
    return fixedScriptMatch[1].trim();
  }

  const bootstrapMatch = html.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i
  );

  if (bootstrapMatch?.[1]) {
    return bootstrapMatch[1].trim();
  }

  return html.trim();
}

function toFetchedActivity(activity: Record<string, unknown>): IxlFetchedActivity {
  const nestedSkill =
    activity.skill && typeof activity.skill === "object" && !Array.isArray(activity.skill)
      ? (activity.skill as Record<string, unknown>)
      : null;
  const durationMinutes =
    typeof activity.durationMinutes === "number" ? activity.durationMinutes : null;

  return {
    occurredAt: String(
      activity.occurredAt ??
        activity.timestamp ??
        activity.completedAt ??
        activity.date
    ),
    skillId: String(
      activity.skillId ??
        activity.skillCode ??
        nestedSkill?.id ??
        activity.code
    ),
    skillName: String(
      activity.skillName ??
        activity.title ??
        nestedSkill?.name ??
        activity.name
    ),
    subject: String(
      activity.subject ??
        activity.domain ??
        activity.course ??
        ""
    ) || null,
    scorePercent:
      typeof activity.scorePercent === "number"
        ? activity.scorePercent
        : typeof activity.score === "number"
          ? activity.score
          : typeof activity.smartScore === "number"
            ? activity.smartScore
            : null,
    durationSeconds:
      typeof activity.durationSeconds === "number"
        ? activity.durationSeconds
        : typeof activity.duration === "number"
          ? activity.duration
          : durationMinutes !== null
            ? durationMinutes * 60
            : null,
    sessionId:
      typeof activity.sessionId === "string"
        ? activity.sessionId
        : typeof activity.id === "string"
          ? activity.id
          : null,
  };
}

function buildCookieHeader(
  cookies: IxlManagedSessionPayload["cookies"] | null | undefined
) {
  if (!cookies?.length) {
    return null;
  }

  return cookies
    .filter(
      (cookie) =>
        typeof cookie?.name === "string" &&
        cookie.name.length > 0 &&
        typeof cookie?.value === "string"
    )
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function parseIxlActivityResponse(html: string): IxlFetchedActivity[] {
  const extractedPayload = extractBootstrapJson(html);
  const parsed = tryParseJson(extractedPayload);
  const activities = findActivityArray(parsed);

  if (!activities) {
    throw new Error("Unable to parse IXL activity payload");
  }

  return activities.map(toFetchedActivity);
}

export async function fetchIxlManagedSessionActivities(input: {
  managedSessionPayload: IxlManagedSessionPayload | null | undefined;
  fetchImpl?: typeof fetch;
}) {
  const cookieHeader = buildCookieHeader(input.managedSessionPayload?.cookies);

  if (!cookieHeader) {
    throw new IxlManagedSessionError("Managed IXL session is missing");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    input.managedSessionPayload?.activityUrl ??
      "https://www.ixl.com/membership/account/activity",
    {
      headers: {
        cookie: cookieHeader,
        ...(input.managedSessionPayload?.headers ?? {}),
      },
    }
  );

  const body = await response.text();

  if (
    response.status === 401 ||
    /sign in to ixl|log in to ixl|signin/i.test(body)
  ) {
    throw new IxlManagedSessionError("Managed IXL session expired");
  }

  return parseIxlActivityResponse(body);
}
