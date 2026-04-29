export type RazKidsManagedSessionPayload = {
  cookies?: Array<{
    name: string;
    value: string;
  }>;
  headers?: Record<string, string>;
  activityUrl?: string | null;
};

export type RazKidsFetchedActivity = {
  occurredAt: string;
  activityId: string | null;
  title: string;
  level: string | null;
  activityType: string | null;
  quizScorePercent: number | null;
  durationSeconds: number | null;
};

export class RazKidsManagedSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RazKidsManagedSessionError";
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
  cookies: RazKidsManagedSessionPayload["cookies"] | null | undefined
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

function looksLikeRazKidsActivity(value: Record<string, unknown>) {
  const hasTitle =
    typeof value.title === "string" ||
    typeof value.bookTitle === "string" ||
    typeof value.resourceTitle === "string" ||
    typeof value.name === "string";
  const hasTimestamp =
    typeof value.occurredAt === "string" ||
    typeof value.timestamp === "string" ||
    typeof value.completedAt === "string" ||
    typeof value.date === "string" ||
    typeof value.activityDate === "string";

  return hasTitle && hasTimestamp;
}

function findRazKidsActivityArray(
  value: unknown
): Array<Record<string, unknown>> | null {
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

    return objectItems.some(looksLikeRazKidsActivity) ? objectItems : null;
  }

  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "activityReport",
    "activities",
    "activity",
    "activityItems",
    "studentActivity",
    "results",
    "items",
    "entries",
  ];

  for (const key of candidateKeys) {
    const candidate = findRazKidsActivityArray(record[key]);

    if (candidate) {
      return candidate;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const candidate = findRazKidsActivityArray(nestedValue);

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractBootstrapJson(body: string) {
  const fixedScriptMatch = body.match(
    /<script[^>]*id=["']__RAZ_ACTIVITY_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (fixedScriptMatch?.[1]) {
    return fixedScriptMatch[1].trim();
  }

  const bootstrapMatch = body.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i
  );

  if (bootstrapMatch?.[1]) {
    return bootstrapMatch[1].trim();
  }

  const appDataMatch = body.match(
    /window\.__APP_DATA__\s*=\s*(\{[\s\S]*?\})\s*;/i
  );

  if (appDataMatch?.[1]) {
    return appDataMatch[1].trim();
  }

  return body.trim();
}

function toRazKidsFetchedActivity(
  activity: Record<string, unknown>
): RazKidsFetchedActivity {
  const durationMinutes =
    typeof activity.durationMinutes === "number"
      ? activity.durationMinutes
      : typeof activity.timeSpentMinutes === "number"
        ? activity.timeSpentMinutes
        : null;

  return {
    occurredAt: String(
      activity.occurredAt ??
        activity.timestamp ??
        activity.completedAt ??
        activity.activityDate ??
        activity.date
    ),
    activityId:
      typeof activity.activityId === "string"
        ? activity.activityId
        : typeof activity.id === "string"
          ? activity.id
          : typeof activity.sessionId === "string"
            ? activity.sessionId
            : typeof activity.resourceId === "string"
              ? activity.resourceId
              : null,
    title: String(
      activity.title ??
        activity.bookTitle ??
        activity.resourceTitle ??
        activity.name
    ),
    level:
      typeof activity.level === "string"
        ? activity.level
        : typeof activity.readingLevel === "string"
          ? activity.readingLevel
          : typeof activity.subject === "string"
            ? activity.subject
            : null,
    activityType:
      typeof activity.activityType === "string"
        ? activity.activityType
        : typeof activity.status === "string"
          ? activity.status
          : typeof activity.state === "string"
            ? activity.state
            : null,
    quizScorePercent:
      typeof activity.quizScorePercent === "number"
        ? activity.quizScorePercent
        : typeof activity.scorePercent === "number"
          ? activity.scorePercent
          : typeof activity.score === "number"
            ? activity.score
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

export function parseRazKidsActivityResponse(body: string): RazKidsFetchedActivity[] {
  const extractedPayload = extractBootstrapJson(body);
  const parsed = tryParseJson(extractedPayload);
  const activities = findRazKidsActivityArray(parsed);

  if (!activities) {
    throw new Error("Unable to parse Raz-Kids activity payload");
  }

  return activities.map(toRazKidsFetchedActivity);
}

function isRazKidsLoginPage(body: string) {
  return (
    /kids login/i.test(body) ||
    /teacher training/i.test(body) ||
    /student portal/i.test(body)
  );
}

export async function fetchRazKidsManagedSessionActivities(input: {
  managedSessionPayload: RazKidsManagedSessionPayload | null | undefined;
  fetchImpl?: typeof fetch;
}) {
  const cookieHeader = buildCookieHeader(input.managedSessionPayload?.cookies);

  if (!cookieHeader) {
    throw new RazKidsManagedSessionError("Managed Raz-Kids session is missing");
  }

  const activityUrl = input.managedSessionPayload?.activityUrl?.trim();

  if (!activityUrl) {
    throw new RazKidsManagedSessionError(
      "Managed Raz-Kids session is missing activity URL"
    );
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(activityUrl, {
    headers: {
      cookie: cookieHeader,
      ...(input.managedSessionPayload?.headers ?? {}),
    },
  });

  const body = await response.text();

  if (response.status === 401 || isRazKidsLoginPage(body)) {
    throw new RazKidsManagedSessionError("Managed Raz-Kids session expired");
  }

  return parseRazKidsActivityResponse(body);
}
