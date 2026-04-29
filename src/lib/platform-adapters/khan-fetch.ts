export type KhanManagedSessionPayload = {
  cookies?: Array<{
    name: string;
    value: string;
  }>;
  headers?: Record<string, string>;
  activityUrl?: string | null;
};

export type KhanFetchedActivity = {
  occurredAt: string;
  lessonId: string | null;
  lessonTitle: string;
  courseName: string | null;
  masteryLevel: string | null;
  progressPercent: number | null;
  durationSeconds: number | null;
};

export class KhanManagedSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KhanManagedSessionError";
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
  cookies: KhanManagedSessionPayload["cookies"] | null | undefined
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
    "activityItems",
    "activityLog",
    "recentActivities",
    "items",
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

function extractBootstrapJson(body: string) {
  const fixedScriptMatch = body.match(
    /<script[^>]*id=["']__KHAN_ACTIVITY_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (fixedScriptMatch?.[1]) {
    return fixedScriptMatch[1].trim();
  }

  const apolloMatch = body.match(
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i
  );

  if (apolloMatch?.[1]) {
    return apolloMatch[1].trim();
  }

  return body.trim();
}

function toFetchedActivity(activity: Record<string, unknown>): KhanFetchedActivity {
  const durationMinutes =
    typeof activity.timeSpentMinutes === "number"
      ? activity.timeSpentMinutes
      : null;

  return {
    occurredAt: String(
      activity.occurredAt ?? activity.timestamp ?? activity.completedAt
    ),
    lessonId:
      typeof activity.lessonId === "string"
        ? activity.lessonId
        : typeof activity.contentId === "string"
          ? activity.contentId
          : null,
    lessonTitle: String(activity.lessonTitle ?? activity.title ?? activity.name),
    courseName:
      typeof activity.courseName === "string"
        ? activity.courseName
        : typeof activity.course === "string"
          ? activity.course
          : null,
    masteryLevel:
      typeof activity.masteryLevel === "string"
        ? activity.masteryLevel
        : typeof activity.state === "string"
          ? activity.state
          : null,
    progressPercent:
      typeof activity.progressPercent === "number"
        ? activity.progressPercent
        : typeof activity.progress === "number"
          ? activity.progress
          : null,
    durationSeconds:
      typeof activity.durationSeconds === "number"
        ? activity.durationSeconds
        : durationMinutes !== null
          ? durationMinutes * 60
          : null,
  };
}

export function parseKhanActivityResponse(body: string): KhanFetchedActivity[] {
  const extractedPayload = extractBootstrapJson(body);
  const parsed = tryParseJson(extractedPayload);
  const activities = findActivityArray(parsed);

  if (!activities) {
    throw new Error("Unable to parse Khan activity payload");
  }

  return activities.map(toFetchedActivity);
}

export async function fetchKhanManagedSessionActivities(input: {
  managedSessionPayload: KhanManagedSessionPayload | null | undefined;
  fetchImpl?: typeof fetch;
}) {
  const cookieHeader = buildCookieHeader(input.managedSessionPayload?.cookies);

  if (!cookieHeader) {
    throw new KhanManagedSessionError("Managed Khan session is missing");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    input.managedSessionPayload?.activityUrl ?? "https://www.khanacademy.org/progress",
    {
      headers: {
        cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://www.khanacademy.org/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        Connection: "keep-alive",
        ...(input.managedSessionPayload?.headers ?? {}),
      },
    }
  );

  const body = await response.text();

  if (
    response.status === 401 ||
    /log in \| khan academy|sign up \| khan academy|login/i.test(body)
  ) {
    throw new KhanManagedSessionError("Managed Khan session expired");
  }

  return parseKhanActivityResponse(body);
}
