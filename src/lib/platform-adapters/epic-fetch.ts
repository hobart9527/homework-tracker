export type EpicManagedSessionPayload = {
  cookies?: Array<{
    name: string;
    value: string;
  }>;
  headers?: Record<string, string>;
  activityUrl?: string | null;
};

export type EpicFetchedActivity = {
  occurredAt: string;
  activityId: string | null;
  title: string;
  category: string | null;
  status: string | null;
  progressPercent: number | null;
  durationSeconds: number | null;
};

export class EpicManagedSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpicManagedSessionError";
  }
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildCookieHeader(
  cookies: EpicManagedSessionPayload["cookies"] | null | undefined
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

function looksLikeEpicActivity(value: Record<string, unknown>) {
  const hasTitle =
    typeof value.title === "string" ||
    typeof value.bookTitle === "string" ||
    typeof value.name === "string" ||
    typeof value.itemTitle === "string";
  const hasTimestamp =
    typeof value.occurredAt === "string" ||
    typeof value.timestamp === "string" ||
    typeof value.readAt === "string" ||
    typeof value.completedAt === "string" ||
    typeof value.date === "string";

  return hasTitle && hasTimestamp;
}

function findEpicActivityArray(value: unknown): Array<Record<string, unknown>> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    const objectItems = value.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item)
    );

    if (!objectItems.length) {
      return null;
    }

    return objectItems.some(looksLikeEpicActivity) ? objectItems : null;
  }

  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "readingLog",
    "studentLogs",
    "studentLog",
    "activityLog",
    "activities",
    "activity",
    "items",
    "entries",
    "results",
  ];

  for (const key of candidateKeys) {
    const candidate = findEpicActivityArray(record[key]);

    if (candidate) {
      return candidate;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const candidate = findEpicActivityArray(nestedValue);

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractBootstrapJson(body: string) {
  const fixedScriptMatch = body.match(
    /<script[^>]*id=["']__EPIC_ACTIVITY_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (fixedScriptMatch?.[1]) {
    return fixedScriptMatch[1].trim();
  }

  const nextDataScriptMatch = body.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (nextDataScriptMatch?.[1]) {
    return nextDataScriptMatch[1].trim();
  }

  const nextDataWindowMatch = body.match(
    /window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*;/i
  );

  if (nextDataWindowMatch?.[1]) {
    return nextDataWindowMatch[1].trim();
  }

  const bootstrapMatch = body.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i
  );

  if (bootstrapMatch?.[1]) {
    return bootstrapMatch[1].trim();
  }

  return body.trim();
}

function toEpicFetchedActivity(activity: Record<string, unknown>): EpicFetchedActivity {
  const durationMinutes =
    typeof activity.timeSpentMinutes === "number"
      ? activity.timeSpentMinutes
      : typeof activity.readingTimeMinutes === "number"
        ? activity.readingTimeMinutes
        : null;

  return {
    occurredAt: String(
      activity.occurredAt ??
        activity.timestamp ??
        activity.readAt ??
        activity.completedAt ??
        activity.date
    ),
    activityId:
      typeof activity.activityId === "string"
        ? activity.activityId
        : typeof activity.id === "string"
          ? activity.id
          : typeof activity.itemId === "string"
            ? activity.itemId
            : typeof activity.bookId === "string"
              ? activity.bookId
              : null,
    title: String(
      activity.title ??
        activity.bookTitle ??
        activity.itemTitle ??
        activity.name
    ),
    category:
      typeof activity.category === "string"
        ? activity.category
        : typeof activity.subject === "string"
          ? activity.subject
          : typeof activity.collectionName === "string"
            ? activity.collectionName
            : null,
    status:
      typeof activity.status === "string"
        ? activity.status
        : typeof activity.state === "string"
          ? activity.state
          : typeof activity.completionState === "string"
            ? activity.completionState
            : null,
    progressPercent:
      typeof activity.progressPercent === "number"
        ? activity.progressPercent
        : typeof activity.progress === "number"
          ? activity.progress
          : typeof activity.percentage === "number"
            ? activity.percentage
            : null,
    durationSeconds:
      typeof activity.durationSeconds === "number"
        ? activity.durationSeconds
        : typeof activity.timeSpentSeconds === "number"
          ? activity.timeSpentSeconds
          : durationMinutes !== null
            ? durationMinutes * 60
            : null,
  };
}

export function parseEpicActivityResponse(body: string): EpicFetchedActivity[] {
  const extractedPayload = extractBootstrapJson(body);
  const parsed = tryParseJson(extractedPayload);
  const activities = findEpicActivityArray(parsed);

  if (!activities) {
    throw new Error("Unable to parse Epic activity payload");
  }

  return activities.map(toEpicFetchedActivity);
}

function isEpicLoginPage(body: string) {
  return (
    /<title>\s*(parent login|log in|sign in)\s*<\/title>/i.test(body) ||
    /forgot your password/i.test(body) ||
    /don.?t have an epic account/i.test(body)
  );
}

export async function fetchEpicManagedSessionActivities(input: {
  managedSessionPayload: EpicManagedSessionPayload | null | undefined;
  fetchImpl?: typeof fetch;
}) {
  const cookieHeader = buildCookieHeader(input.managedSessionPayload?.cookies);

  if (!cookieHeader) {
    throw new EpicManagedSessionError("Managed Epic session is missing");
  }

  const activityUrl = input.managedSessionPayload?.activityUrl?.trim();

  if (!activityUrl) {
    throw new EpicManagedSessionError("Managed Epic session is missing activity URL");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(activityUrl, {
    headers: {
      cookie: cookieHeader,
      ...(input.managedSessionPayload?.headers ?? {}),
    },
  });

  const body = await response.text();

  if (response.status === 401 || isEpicLoginPage(body)) {
    throw new EpicManagedSessionError("Managed Epic session expired");
  }

  return parseEpicActivityResponse(body);
}
